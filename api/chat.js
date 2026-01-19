const express = require('express');
const router = express.Router();
const {authService} = require('./auth');
const database = require('../database');
const notifications = require('../notifications');

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


router.post('/message', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { content, room = 'global' } = req.body;
    const userId = req.user.id;

    // Validar el contenido del mensaje
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'El mensaje no puede estar vacío' });
    }


    // Obtener información del usuario
    const userInfo = await database.findUserById(userId);
    if (!userInfo) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    // Guardar el mensaje en la base de datos
    const messageId = await database.addMessage(userId, content, room);
    const created_at = new Date().toISOString();

    const message = {
      id: messageId,
      user_id: userId,
      nombre: userInfo.nombre || 'Usuario',
      moto: userInfo.moto || 'No especificado',
      color: userInfo.color || 'No especificado',
      content,
      room,
      created_at
    };

    // Emitir a través de WebSocket si está disponible
    if (req.app.get('io')) {
      req.app.get('io').of('/chat').to(room).emit('message:new', message);
    }

    // Enviar notificaciones push a los demás usuarios
    try {
      // Obtener todos los usuarios excepto el remitente
      const allUsers = await database.getAllUsers();
      const recipients = (allUsers || []).filter(u => u.id !== userId);
      
      // Enviar notificación a cada destinatario
      for (const recipient of recipients) {
        await notifications.sendChatNotification(
          recipient.id,  // ID del destinatario
          {
            chatId: room,
            senderId: userId,
            text: content,
            createdAt: created_at
          },
          userInfo.nombre || 'Usuario'  // Nombre del remitente
        );
      }
    } catch (notifError) {
      console.error('Error enviando notificaciones push:', notifError);
      // No fallar la operación principal si fallan las notificaciones
    }

    res.status(201).json({ success: true, message });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// DELETE /chat/message/:id (solo admins)
router.delete('/message/:id', authService.authenticateToken.bind(authService), authService.requireStaffOrAdmin.bind(authService), async (req, res) => {
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
