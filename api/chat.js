const express = require('express');
const router = express.Router();
const {authService} = require('./auth');
const database = require('../database');

// GET /chat/history?room=global&limit=50&before=ISO_DATE
router.get('/history', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const room = (req.query.room || 'global').toString();
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const before = req.query.before ? new Date(req.query.before).toISOString() : null;

    const messages = await database.getMessages({ room, before, limit });
    res.json({ success: true, messages });
  } catch (err) {
    console.error('Error obteniendo historial de chat:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// DELETE /chat/message/:id (solo admins)
router.delete('/message/:id', authService.authenticateToken.bind(authService), authService.requireAdmin.bind(authService), async (req, res) => {
  try {
    const messageId = parseInt(req.params.id, 10);
    if (Number.isNaN(messageId)) return res.status(400).json({ success: false, message: 'ID inválido' });

    const result = await database.softDeleteMessage(messageId, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Mensaje no encontrado o ya eliminado' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error eliminando mensaje:', err);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

module.exports = router;
