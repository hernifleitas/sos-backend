const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./api/auth');
const authService = require('./auth');
const chatRoutes = require('./api/chat');
const notificationsRoutes = require('./api/notifications');
const notifications = require('./notifications');
const database = require('./database');

const app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Guardar info de riders en memoria
let riders = {};

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
    const { riderId, nombre, moto, color, ubicacion, fechaHora, tipo } = req.body;
    if (!riderId || !nombre || !moto || !color || !ubicacion || !ubicacion.lat || !ubicacion.lng || !tipo) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Verificar si es un nuevo SOS (no actualización)
    const esNuevoSOS = tipo && tipo !== "normal" && tipo !== "actualizacion" && !riders[riderId];
    const esSOSInicial = tipo && tipo !== "normal" && tipo !== "actualizacion" && riders[riderId]?.tipo !== tipo;

    // Guardamos/actualizamos info del rider
    riders[riderId] = {
      nombre,
      moto,
      color,
      ubicacion,
      fechaHora: new Date(fechaHora),
      tipo, // "robo", "pinchazo", "normal" o "" si no hay SOS
      lastUpdate: Date.now(),
      appActive: tipo === "normal" ? true : riders[riderId]?.appActive || false, // Solo true si es tipo normal
    };

    console.log(`Ubicación recibida de ${nombre} (${riderId}):`, ubicacion, "tipo:", tipo);
    
    // Notificar a otros usuarios si es un nuevo SOS
    if (esNuevoSOS || esSOSInicial) {
      notificarSOSAOtrosUsuarios({
        riderId,
        nombre,
        moto,
        color,
        ubicacion,
        fechaHora,
        tipo
      });

      // Opción A: excluir al emisor usando JWT del header Authorization
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        let emitterUserId = null;
        if (token) {
          const decoded = authService.verifyToken(token);
          if (decoded?.id) emitterUserId = decoded.id;
        }

        const title = tipo === 'robo' ? '🚨 SOS ROBO' : (tipo === 'accidente' ? '🚑 SOS ACCIDENTE' : '🚨 SOS');
        const body = `${nombre} (${moto} - ${color}) en ${Number(ubicacion.lat).toFixed(4)}, ${Number(ubicacion.lng).toFixed(4)}`;
        const data = {
          kind: 'sos',
          tipo,
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
          // Si no hay token válido, enviar a todos los tokens registrados
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

// Endpoint para obtener riders activos
app.get("/riders", (req, res) => {
  const now = Date.now();
  const cincoMinutos = 5 * 60 * 1000;
  const dosMinutos = 2 * 60 * 1000; // Para bandera verde después de cancelar SOS

  const ridersArray = Object.keys(riders)
    .filter((riderId) => {
      const r = riders[riderId];
      const tiempoInactivo = now - r.lastUpdate;
      
      // Si es tipo "normal" (bandera verde), solo mostrar por 2 minutos
      if (r.tipo === "normal") {
        return tiempoInactivo <= dosMinutos;
      }
      
      // Para otros tipos, mostrar por 5 minutos
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
      const tiempoInactivo = now - r.lastUpdate;
      
      // Solo mostrar alertas SOS activas (no normales)
      return r.tipo && r.tipo !== "normal" && r.tipo !== "actualizacion" && tiempoInactivo <= cincoMinutos;
    })
    .map((riderId) => {
      const r = riders[riderId];
      return {
        riderId,
        nombre: r.nombre,
        moto: r.moto,
        color: r.color,
        tipo: r.tipo,
        ubicacion: r.ubicacion,
        fechaHora: r.fechaHora,
        tiempoTranscurrido: Math.floor((now - r.lastUpdate) / 1000) // en segundos
      };
    })
    .sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora)); // Más recientes primero

  res.json(alertasArray);
});

// Rutas de autenticación
app.use('/auth', authRoutes);
// Rutas de chat
app.use('/chat', chatRoutes);
// Rutas de notificaciones
app.use('/notifications', notificationsRoutes);

// Middleware para verificar autenticación en rutas protegidas
app.use('/protected', authService.authenticateToken.bind(authService));

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || '0.0.0.0'; 

// Crear servidor HTTP y adjuntar Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Inicializar chat en tiempo real
require('./chat')(io);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Servidor Rider SOS corriendo en http://${HOST}:${PORT}`);
  console.log(`📧 Sistema de emails configurado`);
  console.log(`🔐 Autenticación JWT activa`);
  console.log(`💬 Socket.IO listo para chat`);
});
