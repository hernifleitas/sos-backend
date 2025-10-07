// chat.js
const {authService} = require('./api/auth');
const database = require('./database');
const notifications = require('./notifications');

module.exports = function initChat(io) {
  const nsp = io.of('/chat');

  // Middleware de autenticación para el namespace /chat
  nsp.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        || (socket.handshake.headers?.authorization?.split(' ')[1])
        || socket.handshake.query?.token;
      if (!token) return next(new Error('unauthorized'));

      const decoded = authService.verifyToken(token);
      if (!decoded) return next(new Error('forbidden'));

      socket.user = decoded; // { id, email, nombre }
      return next();
    } catch (e) {
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

        // Check de Premium/Admin antes de permitir enviar
        const hasPremium = await database.isPremium(socket.user.id);
        const isAdmin = await database.isAdmin(socket.user.id);
        if (!hasPremium || !isAdmin) {
          if (ack) ack({ success: false, message: 'Función Premium requerida' });
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

        // Enviar push a los demás (Premium en el futuro; por ahora a todos registrados menos el emisor)
        try {
          const body = `${message.nombre}: ${content.slice(0, 60)}${content.length > 60 ? '…' : ''}`;
          await notifications.sendToAllExcept(socket.user.id, '💬 Nuevo mensaje', body, {
            kind: 'chat',
            room: targetRoom,
            messageId: message.id,
          });
        } catch (e) {
          console.error('Error enviando push de chat:', e);
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
        const isAdmin = await database.isAdmin(socket.user.id);
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
