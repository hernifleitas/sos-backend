// chat.js
const {authService} = require('./api/auth');
const database = require('./database');
const notifications = require('./notifications');

module.exports = function initChat(io) {
  const nsp = io.of('/chat');

  // Middleware de autenticación para el namespace /chat
  nsp.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || (socket.handshake.headers?.authorization?.split(' ')[1])
        || socket.handshake.query?.token;
      if (!token) return next(new Error('unauthorized'));

      const decoded = authService.verifyToken(token);
      if (!decoded) return next(new Error('forbidden'));

      const isAdmin = await database.isStaffOrAdmin(decoded.id);
      const isPremium = await database.isPremium(decoded.id);

      // Permitir si es admin o premium
      if (!isAdmin && !isPremium) {
        // Comentado para permitir a todos los usuarios
        // return next(new Error('Premium requerido'));
      }

      socket.user = decoded; // { id, email, nombre }
      return next();
    } catch (e) {
      console.error('Error en middleware de chat:', e);
      return next(new Error('forbidden'));
    }
  });

  nsp.on('connection', async (socket) => {
    // Unir al room global por defecto
    const room = 'global';
    socket.join(room);

    // Enviar mensaje (solo Premium o Admin)
    socket.on('message:send', async (payload = {}, ack) => {
      try {
        const content = String(payload.content || '').trim();
        const targetRoom = String(payload.room || room);
        if (!content) {
          if (ack) ack({ success: false, message: 'Mensaje vacío' });
          return;
        }


        // Persistir
        const insert = await database.addMessage(socket.user.id, content, targetRoom);
        const userInfo = await database.findUserById(socket.user.id);
        const created_at = new Date().toISOString();

        const message = {
          id: insert.id,
          user_id: socket.user.id,
          nombre: userInfo?.nombre || socket.user.nombre || 'Usuario',
          moto: userInfo?.moto || 'No especificado',
          color: userInfo?.color || 'No especificado',
          content,
          room: targetRoom,
          created_at
        };

        // Emitir a todos en el room
        nsp.to(targetRoom).emit('message:new', message);

     try {
  // Obtener todos los usuarios excepto el emisor
  const allUsers = await database.getAllUsers();
  const recipients = (allUsers || []).filter(u => u.id !== socket.user.id);

  for (const recipient of recipients) {
    await notifications.sendChatNotification(
      recipient.id,
      {
        chatId: targetRoom,
        senderId: socket.user.id,
        text: content,
        createdAt: created_at,
      },
      message.nombre || 'Usuario'
    );
  }
} catch (e) {
  console.error('Error enviando push de chat (socket):', e);
}

        if (ack) ack({ success: true, message });
      } catch (err) {
        console.error('Error enviando mensaje:', err);
        if (ack) ack({ success: false, message: 'Error interno' });
      }
    });

    // Borrar mensaje (solo admin)
    socket.on('message:delete', async (payload = {}, ack) => {
      try {
        const messageId = Number(payload.id);
        if (!messageId) {
          if (ack) ack({ success: false, message: 'ID inválido' });
          return;
        }
        const isAdmin = await database.isStaffOrAdmin(socket.user.id);
        if (!isAdmin) {
          if (ack) ack({ success: false, message: 'No autorizado' });
          return;
        }
        const result = await database.softDeleteMessage(messageId, socket.user.id);
        if (!result.changes) {
          if (ack) ack({ success: false, message: 'Mensaje no encontrado' });
          return;
        }
        // Notificar eliminación a todos
        nsp.emit('message:deleted', { id: messageId });
        if (ack) ack({ success: true });
      } catch (err) {
        console.error('Error borrando mensaje:', err);
        if (ack) ack({ success: false, message: 'Error interno' });
      }
    });

    socket.on('disconnect', () => {
      // Limpieza opcional
    });
  });
};
