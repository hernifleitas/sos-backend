const express = require('express');
const router = express.Router();
const database = require('../database');
const { 
  notifyGomerosAboutPinchazo, 
  notifyRiderAboutGomero 
} = require('../notifications');

const {authService} = require('./auth');

// Enviar alerta de pinchazo
router.post('/pinchazo', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const userId = req.user.id;
    const { location } = req.body;
    
    // Validar ubicación
    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({ error: 'Ubicación inválida' });
    }

    // Obtener datos del usuario
    const userResult = await database.pool.query(
  'SELECT id, nombre, email, role FROM users WHERE id = $1',
  [userId]
);
const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Crear alerta
    const result = await database.createPinchazoAlert({
      userId,
      lat: location.lat,
      lng: location.lng,
      notes: req.body.notes
    });

    // Notificar a gomeros cercanos (en segundo plano)
    notifyGomerosAboutPinchazo(result.id, user.nombre || 'Un usuario', location)
      .catch(error => console.error('Error notificando a gomeros:', error));

    res.status(201).json({
      ...result,
      message: 'Alerta de pinchazo creada correctamente'
    });
  } catch (error) {
    console.error('Error creando alerta de pinchazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Aceptar alerta de pinchazo (para gomeros)
router.post('/pinchazo/:alertId/accept', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { alertId } = req.params;
    const userId = req.user.id;

    // Verificar que el usuario es un gomero
    const gomero = await database.getUserById(userId);
    if (gomero.role !== 'gomero') {
      return res.status(403).json({ error: 'Solo los gomeros pueden aceptar alertas' });
    }

    // Actualizar estado de la alerta
    const updatedAlert = await database.updatePinchazoAlertStatus(
      alertId, 
      'accepted', 
      userId
    );

    if (!updatedAlert) {
      return res.status(404).json({ error: 'Alerta no encontrada o ya fue tomada' });
    }

    // Notificar al rider (en segundo plano)
    notifyRiderAboutGomero(alertId, gomero.nombre || 'Un gomero', gomero.telefono || '')
      .catch(error => console.error('Error notificando al rider:', error));

    res.json({
      ...updatedAlert,
      message: 'Has aceptado la alerta de pinchazo'
    });
  } catch (error) {
    console.error('Error aceptando alerta de pinchazo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener alertas de pinchazo activas (para gomeros)
router.get('/pinchazo/active', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Verificar que el usuario es un gomero
    const user = await database.getUserById(userId);
    if (user.role !== 'gomero') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const alerts = await database.getGomeroPinchazoAlerts(userId, 'pending');
    res.json(alerts);
  } catch (error) {
    console.error('Error obteniendo alertas activas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
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
    const alert = await database.getPinchazoAlert(alertId);
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