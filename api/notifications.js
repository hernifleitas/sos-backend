const express = require('express');
const router = express.Router();
const {authService} = require('./auth');
const database = require('../database');
const notifications = require('../notifications');

// POST /notifications/register { token }
router.post('/register', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token inválido' });
    }
    await database.upsertDeviceToken(req.user.id, token);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error registrando token de notificación:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// En sos-backend/api/notifications.js
router.post('/unregister', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token inválido' });
    }
    
    // Eliminar el token de la base de datos
    await database.deleteDeviceToken(req.user.id, token);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando token de notificación:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// POST /notifications/test { title?, body?, data? }
router.post('/test', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const title = req.body?.title || '🔔 Prueba de notificaciones';
    const body = req.body?.body || 'Mensaje de prueba desde /notifications/test';
    const data = req.body?.data || { kind: 'test' };
    const result = await notifications.sendToAllExcept(req.user.id, title, body, data);
    return res.json({ success: true, result });
  } catch (err) {
    console.error('Error enviando notificación de prueba:', err?.message || err);
    return res.status(500).json({ success: false, message: 'No se pudo enviar la notificación de prueba' });
  }
});

module.exports = router;
