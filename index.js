const express = require("express");
const cors = require("cors");
require('dotenv').config();
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { router: authRoutes } = require('./api/auth');
const chatRoutes = require('./api/chat');
const notificationsRoutes = require('./api/notifications');
const notifications = require('./notifications');
const premiumRoutes = require('./api/premium');
const analyticsRoutes = require('./api/analytics');
const zonasPeligrosasRoutes = require('./api/zonas-peligrosas');
const database = require('./database');

const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use('/api/zonas-peligrosas', zonasPeligrosasRoutes);


// Servir archivos estáticos de premium
app.use('/premium', express.static(path.join(__dirname, 'public/premium')));

// Ruta principal para index.html de premium
app.get('/premium', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/premium/index.html'));
});

// Rutas de retorno de MercadoPago
app.get('/premium/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/premium/success.html'));
});

app.get('/premium/failure', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/premium/failure.html'));
});

app.get('/premium/pending', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/premium/pending.html'));
});

app.get('/politica-privacidad', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/politica-privacidad.html'));
});


// Guardar info de riders en memoria
let riders = {};
// Memoria de última alerta por rider con datos y timestamp (para ventana de gracia)
// { [riderId]: { tipo, nombre, moto, color, ubicacion, fechaHora, timestamp } }
let lastAlerts = {};
const ALERT_GRACE_MS = 10 * 60 * 1000; // 10 minutos de gracia
// Anti-burst: recordar último recibido por rider para filtrar ráfagas de 'actualizacion'
// { [riderId]: { ts: number, fechaIso: string, tipo: string } }
let lastReceive = {};
// Función para enviar notificación a otros usuarios sobre SOS
const notificarSOSAOtrosUsuarios = (sosData) => {
  // Esta función se puede expandir para enviar notificaciones push reales
  // Por ahora, solo logueamos la información
  console.log(`🚨 ALERTA SOS: ${sosData.tipo.toUpperCase()} de ${sosData.nombre}`);
  console.log(`📍 Ubicación: ${sosData.ubicacion.lat}, ${sosData.ubicacion.lng}`);
  console.log(`🏍️ Moto: ${sosData.moto} (${sosData.color})`);
  console.log(`⏰ Hora: ${sosData.fechaHora}`);
  console.log('---');

  // Aquí se podría integrar con servicios como Firebase Cloud Messaging
  // para enviar notificaciones push reales a otros usuarios
};

// Recibir ubicación/SOS
app.post("/sos", async (req, res) => {
  try {
    const { riderId, nombre, moto, color, ubicacion, fechaHora, tipo, tipoSOSActual, cancel, esActualizacion, esEmergencia } = req.body;
    // Validar sin rechazar coordenadas 0,0
    const latValida = typeof ubicacion?.lat === 'number' && !Number.isNaN(ubicacion.lat);
    const lngValida = typeof ubicacion?.lng === 'number' && !Number.isNaN(ubicacion.lng);
    if (!riderId || !nombre || !moto || !color || !ubicacion || !latValida || !lngValida || !tipo) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Verificar si es un nuevo SOS (no actualización)
    const esNuevoSOS = !esActualizacion && tipo && tipo !== "normal" && tipo !== "actualizacion" && !riders[riderId];
    const esSOSInicial = !esActualizacion && tipo && tipo !== "normal" && tipo !== "actualizacion" && riders[riderId]?.tipo !== tipo;
    
    // Anti-burst: ignorar ráfagas de 'actualizacion' del mismo rider en < 3s o con misma fechaHora
    const nowTs = Date.now();
    const last = lastReceive[riderId];
    if (esActualizacion || tipo === 'actualizacion') {
      const mismaFecha = last && last.fechaIso === fechaHora;
      const ventanaCorta = last && (nowTs - last.ts) < 3000; // 3 segundos
      if (mismaFecha || ventanaCorta) {
        lastReceive[riderId] = { ts: nowTs, fechaIso: fechaHora, tipo };
        return res.json({ success: true, ignored: true, reason: 'anti-burst-actualizacion' });
      }
    }
    // Registrar última recepción
    lastReceive[riderId] = { ts: nowTs, fechaIso: fechaHora, tipo };

    // Determinar tipo a almacenar: si llega 'actualizacion', conservar el tipo previo (robo/accidente)
    const tipoPrevio = riders[riderId]?.tipo;
    // Considerar memoria de última alerta si no hay tipo SOS previo (p.ej. reinicio de server o app bloqueada)
    const memoriaValida = lastAlerts[riderId] && (nowTs - lastAlerts[riderId].timestamp) <= ALERT_GRACE_MS
      ? lastAlerts[riderId].tipo
      : null;
    const lastSosPrevio = riders[riderId]?.lastSosTipo || null;
    const tipoSOSPrevio = (tipoPrevio && tipoPrevio !== 'normal' && tipoPrevio !== 'actualizacion') ? tipoPrevio : null;
    const candidatoSOS = tipoSOSPrevio || lastSosPrevio || memoriaValida || tipoSOSActual || null;
    // REGLA: 'actualizacion' NO cambia el tipo; solo actualiza ubicacion. Si hay un SOS previo, se mantiene.
    
    let tipoAAlmacenar;
    if (tipo === 'actualizacion') {
      // Si es una actualización, mantener el tipo actual
      tipoAAlmacenar = tipoSOSPrevio || lastSosPrevio || memoriaValida || tipoPrevio || 'normal';
    } else if (tipo === 'repartiendo') {
      // Si es 'repartiendo', solo actualizar si no hay una alerta activa
      const tieneAlertaActiva = ['robo', 'accidente'].includes(tipoSOSPrevio) ||
        ['robo', 'accidente'].includes(lastSosPrevio) ||
        (memoriaValida && ['robo', 'accidente'].includes(memoriaValida));
      tipoAAlmacenar = tieneAlertaActiva ? (tipoSOSPrevio || lastSosPrevio || memoriaValida) : tipo;
    } else {
      // Para otros tipos (robo, accidente), siempre actualizar
      tipoAAlmacenar = tipo;
    }

    // Calcular lastSosTipo para mantener el tipo SOS histórico reciente
    let lastSosTipo = riders[riderId]?.lastSosTipo || null;
    if (tipoAAlmacenar !== 'normal' && tipoAAlmacenar !== 'actualizacion') {
      lastSosTipo = tipoAAlmacenar; // actualizar cuando hay un SOS real
      // Actualizar memoria de última alerta con datos completos
      lastAlerts[riderId] = { tipo: tipoAAlmacenar, nombre, moto, color, ubicacion, fechaHora: new Date(fechaHora), timestamp: nowTs };
    } else if (tipo === 'actualizacion') {
      if (lastAlerts[riderId]) {
        lastAlerts[riderId] = { ...lastAlerts[riderId], ubicacion, fechaHora: new Date(fechaHora), timestamp: nowTs, tipo: lastAlerts[riderId].tipo || riders[riderId]?.lastSosTipo || tipoSOSActual || lastAlerts[riderId]?.tipo };
      } else if ((tipoSOSActual && tipoSOSActual !== 'normal') || riders[riderId]?.lastSosTipo || tipoSOSPrevio) {
        // Crear memoria si hay información de SOS previo
        const tipoMem = tipoSOSActual && tipoSOSActual !== 'normal' ? tipoSOSActual : (riders[riderId]?.lastSosTipo || tipoSOSPrevio);
        lastAlerts[riderId] = { tipo: tipoMem, nombre, moto, color, ubicacion, fechaHora: new Date(fechaHora), timestamp: nowTs };
      }
    }

    // Manejo especial de 'normal': solo aceptar si cancel === true
    if (tipo === 'normal') {
      const memoria = lastAlerts[riderId];
      const memoriaVigente = memoria && ((nowTs - memoria.timestamp) <= ALERT_GRACE_MS);
      if (cancel === true) {
        // cancelación explícita
        delete lastAlerts[riderId];
        if (riders[riderId]) {
          riders[riderId].lastSosTipo = null;
          riders[riderId].tipo = 'normal';
        }
      } else if (memoriaVigente) {
        // Ignorar 'normal' no intencional durante gracia
        if (riders[riderId]) {
          riders[riderId].tipo = riders[riderId].lastSosTipo || memoria?.tipo || 'actualizacion';
        }
      } else {
        // No hay memoria vigente: aceptar normal
        delete lastAlerts[riderId];
      }
    } else if (tipo === 'actualizacion') {
      // Mantener fresh la ubicación y hora en memoria durante la gracia; si viene tipoSOSActual, también refrescar tipo
      if (lastAlerts[riderId]) {
        lastAlerts[riderId] = { ...lastAlerts[riderId], ubicacion, fechaHora: new Date(fechaHora), timestamp: nowTs, tipo: lastAlerts[riderId].tipo || riders[riderId]?.lastSosTipo || tipoSOSActual || lastAlerts[riderId]?.tipo };
      } else if ((tipoSOSActual && tipoSOSActual !== 'normal') || riders[riderId]?.lastSosTipo || tipoSOSPrevio) {
        // Crear memoria si hay información de SOS previo
        const tipoMem = tipoSOSActual && tipoSOSActual !== 'normal' ? tipoSOSActual : (riders[riderId]?.lastSosTipo || tipoSOSPrevio);
        lastAlerts[riderId] = { tipo: tipoMem, nombre, moto, color, ubicacion, fechaHora: new Date(fechaHora), timestamp: nowTs };
      }
    }

    // Guardamos/actualizamos info del rider
    riders[riderId] = {
      nombre,
      moto,
      color,
      ubicacion,
      fechaHora: new Date(fechaHora),
      tipo: tipoAAlmacenar,
      lastSosTipo, // nuevo campo para recordar el último tipo SOS real
      lastUpdate: Date.now(),
      appActive: tipoAAlmacenar === "normal" ? true : riders[riderId]?.appActive || false,
    };


    const esNotificable = (esNuevoSOS || esSOSInicial) && 
                     !esActualizacion && 
                     tipoAAlmacenar && 
                     ['robo', 'accidente'].includes(tipoAAlmacenar);

if (esNotificable) {
    // Guardar alerta SOS en la base de datos
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (token) {
        const jwt = require('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET || 'rider-sos-secret-key-2024';
        const decoded = jwt.verify(token, jwtSecret);
        if (decoded?.id) {
          await database.createSosAlert({
            userId: decoded.id,
            tipo: tipoAAlmacenar,
            lat: ubicacion.lat,
            lng: ubicacion.lng,
            fechaHora: new Date(fechaHora)
          });
        }
      }
    } catch (dbError) {
      console.error('Error guardando alerta SOS en la base de datos:', dbError);
      // No bloquear la respuesta por error de DB, solo loguear
    }

    console.log('🚨 Enviando ALERTA por:', tipoAAlmacenar);
    notificarSOSAOtrosUsuarios({
      riderId,
      nombre,
      moto,
      color,
      ubicacion,
      fechaHora,
      tipo: tipoAAlmacenar
    });
    // Notificar a otros usuarios si es un nuevo SOS
  /* if ((esNuevoSOS || esSOSInicial) && !esActualizacion) {
      notificarSOSAOtrosUsuarios({
        riderId,
        nombre,
        moto,
        color,
        ubicacion,
        fechaHora,
        tipo: tipoAAlmacenar
      });
*/
      // Opción A: excluir al emisor usando JWT del header Authorization
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let emitterUserId = null;
        if (token) {
          const jwt = require('jsonwebtoken');
          const jwtSecret = process.env.JWT_SECRET || 'rider-sos-secret-key-2024';
          const decoded = jwt.verify(token, jwtSecret);
          if (decoded?.id) emitterUserId = decoded.id;
        }

        const title = tipoAAlmacenar === 'robo'
          ? '🔔 NUEVA ALERTA DE ROBO'
          : (tipoAAlmacenar === 'accidente'
            ? '🔔 NUEVA ALERTA DE ACCIDENTE'
            : '🔔 NUEVA ALERTA SOS');
        const body = `${nombre} (${moto} - ${color})`;
        const data = {
          kind: 'sos',
          tipo: tipoAAlmacenar,
          riderId,
          nombre,
          moto,
          color,
          lat: ubicacion.lat,
          lng: ubicacion.lng,
          fechaHora
        };

        if (emitterUserId) {
          await notifications.sendToAllExcept(emitterUserId, title, body, data);
        } else {
          const tokens = await database.getAllTokens();
          await notifications.sendPush(tokens, title, body, data);
        }
      } catch (e) {
        console.error('Error enviando push de SOS:', e);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error recibiendo SOS:", err.message);
    res.status(500).json({ error: "No se pudo recibir la ubicación" });
  }
});


const alertsRouter = require('./api/alerts');
app.use('/api/alerts', alertsRouter);

// Endpoint para obtener riders activos
app.get("/riders", (req, res) => {
  const now = Date.now();
  const cincoMinutos = 5 * 60 * 1000;
  const dosMinutos = 2 * 60 * 1000; // Para bandera verde después de cancelar SOS

  const ridersArray = Object.keys(riders)
    .filter((riderId) => {
      const r = riders[riderId];
      const tiempoInactivo = now - r.lastUpdate;

      const sosActivo = r.tipo && r.tipo !== "normal" && r.tipo !== "actualizacion";
      // Mantener SOS activos visibles sin expirar por tiempo
      if (sosActivo) return true;

      // Si es tipo "normal" (bandera verde), solo mostrar por 2 minutos
      if (r.tipo === "normal") {
        return tiempoInactivo <= dosMinutos;
      }

      // Si no hay tipo establecido, ocultar después de 5 minutos
      return tiempoInactivo <= cincoMinutos;
    })
    .map((riderId) => {
      const r = riders[riderId];
      let tipoMostrar = r.tipo;

      // Si es tipo "normal" y han pasado más de 2 minutos, no mostrar
      if (r.tipo === "normal" && (now - r.lastUpdate) > dosMinutos) {
        return null;
      }

      return {
        riderId,
        lat: r.ubicacion.lat,
        lng: r.ubicacion.lng,
        tipo: tipoMostrar || null,
        nombre: r.nombre,
        moto: r.moto,
        color: r.color,
        fechaHora: r.fechaHora,
      };
    })
    .filter(rider => rider !== null); // Filtrar los null

  res.json(ridersArray);
});

// Endpoint para obtener alertas SOS recientes
app.get("/alertas", (req, res) => {
  const now = Date.now();
  const cincoMinutos = 5 * 60 * 1000;

  const alertasArray = Object.keys(riders)
    .filter((riderId) => {
      const r = riders[riderId];

      // No mostrar alertas canceladas
      if (lastAlerts[riderId]?.tipo === 'normal' || r.tipo === 'normal') {
        return false;
      }

      // Resto de la lógica de filtrado
      const esSOSReal = r.tipo && r.tipo !== "normal" && r.tipo !== "actualizacion";
      const esActualizacionConSOS = r.tipo === 'actualizacion' && !!r.lastSosTipo;
      const memoria = lastAlerts[riderId];
      const memoriaVigente = memoria && ((now - memoria.timestamp) <= ALERT_GRACE_MS);
      const lastSosReciente = !!r.lastSosTipo && ((now - r.lastUpdate) <= ALERT_GRACE_MS);

      return esSOSReal || esActualizacionConSOS || memoriaVigente || lastSosReciente;
    })
    .map((riderId) => {
      const r = riders[riderId];
      // Resolver tipo a mostrar
      let tipoMostrar = r.tipo;
      if ((tipoMostrar === 'actualizacion' || tipoMostrar === 'normal') && r.lastSosTipo) {
        tipoMostrar = r.lastSosTipo;
      }

      return {
        riderId,
        nombre: r.nombre,
        moto: r.moto,
        color: r.color,
        tipo: tipoMostrar,
        ubicacion: r.ubicacion,
        fechaHora: r.fechaHora,
        tiempoTranscurrido: Math.floor((now - r.lastUpdate) / 1000)
      };
    })
    .sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora));

  res.json(alertasArray);
});

// Configuración de rutas API
const API_PREFIX = '/api';
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/analytics`, analyticsRoutes);
// Rutas de chat
app.use(`${API_PREFIX}/chat`, chatRoutes);
// Rutas de notificaciones
app.use(`${API_PREFIX}/notifications`, notificationsRoutes);
// Rutas de premium
app.use(`${API_PREFIX}/premium`, premiumRoutes);

// Middleware para verificar autenticación en rutas protegidas
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acceso requerido'
    });
  }

  try {
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'rider-sos-secret-key-2024';
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Token inválido o expirado'
    });
  }
};

app.use(`${API_PREFIX}/protected`, authenticateToken);

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0';

// Crear servidor HTTP y adjuntar Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('io', io);

// Inicializar chat en tiempo real
require('./chat')(io);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor Rider SOS corriendo en http://${HOST}:${PORT}`);
  console.log(`📧 Sistema de emails configurado`);
  console.log(`🔐 Autenticación JWT activa`);
  console.log(`💬 Socket.IO listo para chat`);
});