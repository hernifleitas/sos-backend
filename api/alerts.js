const express = require('express');
const router = express.Router();
const database = require('../database');
const { 
  notifyGomerosAboutPinchazo, 
  notifyRiderAboutGomero, 
  notifyRiderAboutGomeroRejection,
  
} = require('../notifications');

const {authService} = require('./auth');

// Enviar alerta de pinchazo
router.post(
  '/pinchazo',
  authService.authenticateToken.bind(authService),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { location } = req.body;

      // Validar ubicación
      if (!location || !location.lat || !location.lng) {
        return res.status(400).json({ error: 'Ubicación inválida' });
      }

      // 1️⃣ CANCELAR ALERTAS VIEJAS
      await database.pool.query(
        `
        UPDATE pinchazo_alerts
        SET
          status = 'cancelled',
          gomero_id = NULL,
          canceled_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
          AND status IN ('pending', 'accepted', 'on_way')
        `,
        [userId]
      );

      // Obtener usuario
      const userResult = await database.pool.query(
        'SELECT id, nombre FROM users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // 2️⃣ CREAR NUEVA ALERTA
      const result = await database.createPinchazoAlert({
        userId,
        lat: location.lat,
        lng: location.lng,
        notes: req.body.notes
      });

      // 3️⃣ NOTIFICAR GOMEROS
      notifyGomerosAboutPinchazo(
        result.id,
        user.nombre || 'Un usuario',
        location
      ).catch(err =>
        console.error('Error notificando a gomeros:', err)
      );

      res.status(201).json({
        ...result,
        message: 'Alerta de pinchazo creada correctamente'
      });
    } catch (error) {
      console.error('Error creando alerta de pinchazo:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

// Aceptar alerta de pinchazo (para gomeros)
router.post('/pinchazo/:alertId/accept',
  authService.authenticateToken.bind(authService),
  async (req, res) => {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      const gomero = await database.findUserById(userId);
      if (!gomero) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      if (gomero.role !== 'gomero') {
        return res.status(403).json({ error: 'Solo los gomeros pueden aceptar alertas' });
      }

      const updatedAlert = await database.updatePinchazoAlertStatus(
        alertId,
        'accepted',
        userId
      );

      if (!updatedAlert) {
        return res.status(404).json({ error: 'Alerta no encontrada o ya fue tomada' });
      }

      notifyRiderAboutGomero(
        updatedAlert,
        gomero.nombre || 'Un gomero',
        gomero.telefono || ''
      ).catch(console.error);

      res.json({
        ...updatedAlert,
        message: 'Has aceptado la alerta de pinchazo'
      });
    } catch (error) {
      console.error('Error aceptando alerta:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);

//rechazar 
    router.post('/pinchazo/:alertId/reject',
  authService.authenticateToken.bind(authService),
  async (req, res) => {
    try {
      const { alertId } = req.params;
      const userId = req.user.id;

      const gomero = await database.findUserById(userId);
      if (!gomero) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      if (gomero.role !== 'gomero') {
        return res.status(403).json({ error: 'Solo los gomeros pueden rechazar alertas' });
      }

      const updatedAlert = await database.updatePinchazoAlertStatus(
        alertId,
        'pending',
        null
      );

      notifyRiderAboutGomeroRejection(updatedAlert)
        .catch(console.error);

      res.json({
        ...updatedAlert,
        message: 'Has rechazado la alerta'
      });

    } catch (error) {
      console.error('Error rechazando alerta:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  }
);
 

// Obtener alertas de pinchazo activas (para gomeros)
router.get('/pinchazo/active', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    console.log('Solicitud recibida en /pinchazo/active');
    const userId = req.user.id;
    console.log('Usuario autenticado ID:', userId);
    
    // Verificar que el usuario es un gomero
    const user = await database.findUserById(userId);
    console.log('Datos del usuario:', user);
    
    if (user.role !== 'gomero') {
      console.log('Acceso denegado: el usuario no es un gomero');
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    console.log('Obteniendo alertas activas...');
    const alerts = await database.getGomeroPinchazoAlerts(userId, 'pending');
    console.log('Alertas encontradas:', alerts.length);
    
    res.json(alerts);
  } catch (error) {
    console.error('Error detallado en /pinchazo/active:', {
      message: error.message,
      stack: error.stack,
      error: error
    });
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});


//Obtener el ID de la alerta activa .

router.get('/pinchazo/:id', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const alertId = req.params.id;
    const result = await database.findPinchazoAlertById(alertId);
    
    if (!result) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }
    
    const response = {
      ...result,
      gomero: result.gomero_id ? {
        id: result.gomero_id,
        nombre: result.gomero_nombre || 'Gomero',
        telefono: result.gomero_telefono
      } : null
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error obteniendo alerta:', error);
    res.status(500).json({ error: 'Error al obtener la alerta' });
  }
});

// Obtener historial de alertas de un usuario
router.get('/pinchazo/history', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = await database.getUserPinchazoAlerts(userId);
    res.json(alerts);
  } catch (error) {
    console.error('Error obteniendo historial de alertas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Cancelar alerta de pinchazo
router.post('/pinchazo/:alertId/cancel', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;

    // Verificar que el usuario es el dueño de la alerta
    const alert = await database.findPinchazoAlertById(alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alerta no encontrada' });
    }

    if (alert.user_id !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para cancelar esta alerta' });
    }

    // Actualizar estado de la alerta
    const updatedAlert = await database.updatePinchazoAlertStatus(
      alertId,
      'cancelled'
    );

    res.json({
      ...updatedAlert,
      message: 'Alerta cancelada correctamente'
    });
  } catch (error) {
    console.error('Error cancelando alerta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener historial de alertas SOS de un usuario
router.get('/history', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const userId = req.user.id;
    const alerts = await database.getSosAlertHistory(userId);
    res.json(alerts);
  } catch (error) {
    console.error('Error obteniendo historial de alertas SOS:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;