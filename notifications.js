const database = require('./database');

// Mejorar la compatibilidad con fetch
let fetchFn;
if (typeof global.fetch === 'function') {
  fetchFn = global.fetch;
} else {
  fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPush(tokens, title, body, data = {}, options = {}) {
  const CHUNK_SIZE = 100;

  if (!tokens?.length) {
    return { success: true, sent: 0 };
  }

  const validTokens = tokens.filter(token => 
    token && typeof token === 'string' && token.startsWith('ExponentPushToken')
  );

  if (validTokens.length === 0) {
    return { success: false, sent: 0, error: 'No valid tokens' };
  }

  const messages = validTokens.map(token => {
    const message = {
      to: token,
      sound: options.sound === null ? null : 'default',
      title,
      body,
      data,
      priority: 'high',
      _displayInForeground: true
    };
    if (data.chatId) {
      message.data = { ...message.data, _group: 'chat-messages' };
    }
    return message;
  });

  const chunks = [];
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + CHUNK_SIZE));
  }

  let totalSent = 0;
  const ticketErrors = [];
  const invalidTokens = new Set();

  try {
    const ticketPromises = chunks.map(chunk => fetchFn(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(chunk),
    }));

    const responses = await Promise.all(ticketPromises);

    for (const response of responses) {
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error en lote de notificaciones: ${response.status}`, { error: errorText });
        ticketErrors.push({ status: response.status, details: errorText });
        continue;
      }

      const { data: tickets } = await response.json();
      
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          totalSent++;
        } else {
          const errorDetails = ticket.details?.error;
          if (errorDetails === 'DeviceNotRegistered') {
            const badToken = chunks.flat()[index].to;
            invalidTokens.add(badToken);
          }
          ticketErrors.push({ 
            status: ticket.status, 
            message: ticket.message, 
            details: ticket.details 
          });
        }
      });
    }

    if (invalidTokens.size > 0) {
      console.log(`Eliminando ${invalidTokens.size} tokens inválidos...`);
      database.deleteTokens(Array.from(invalidTokens)).catch(console.error);
    }

    if (ticketErrors.length > 0) {
      console.error(`Finalizado con ${ticketErrors.length} errores individuales. Notificaciones enviadas: ${totalSent}/${validTokens.length}.`);
    }

    console.log(`Envío completado. ${totalSent} notificaciones enviadas con éxito.`);
    return { success: ticketErrors.length === 0, sent: totalSent, errors: ticketErrors };

  } catch (error) {
    console.error('Error crítico enviando notificaciones:', error);
    return { success: false, sent: totalSent, error: error.message };
  }
}

async function sendToAllExcept(userId, title, body, data = {}) {
  try {
    const tokens = await database.getAllTokensExcept(userId);
    
    if (!tokens || tokens.length === 0) {
      console.log('Usuario no tiene tokens de notificación');
      return { success: false, error: 'No device tokens' };
    }

    return await sendPush(tokens, title, body, data);
  } catch (error) {
    console.error('Error en sendToAllExcept:', {
      error: error.message,
      stack: error.stack,
      userId
    });
    return { 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

async function sendChatNotification(recipientId, message, senderName) {
  try {
    // Obtener el usuario y sus tokens
    const user = await database.findUserById(recipientId);
    if (!user) {
      console.log('Usuario no encontrado para notificación de chat');
      return { success: false, error: 'User not found' };
    }

    // Obtener tokens del usuario
    const tokens = await database.getUserDeviceTokens(recipientId);
    if (!tokens || tokens.length === 0) {
      console.log('Usuario no tiene tokens de notificación');
      return { success: false, error: 'No device tokens' };
    }

    // Contar mensajes no leídos
    const unreadCount = await getUnreadMessageCount(recipientId);
    
    // Configurar notificación agrupada
    const title = 'Chat Riders';
    const body = unreadCount > 1 
      ? `Tienes ${unreadCount} mensajes nuevos` 
      : `Nuevo mensaje de ${senderName || 'un contacto'}`;

    // Enviar notificación
    const data = {
      chatId: (message.chatId || 'gen').substring(0, 20),
      senderId: message.senderId ? message.senderId.toString().substring(0, 20) : '',
      message: (message.text || '(Msg)').substring(0, 50),
      timestamp: Math.floor(Date.now() / 1000).toString(),
      unreadCount: Math.min(unreadCount, 99),
      type: 'chat',
      _notificationId: `c-${recipientId}`.substring(0, 30),
      _count: Math.min(unreadCount, 99),
      _group: 'chat'
    };

    return await sendPush(tokens, title, body, data, { sound: null });

  } catch (error) {
    // console.error('Error en sendChatNotification:', error);
    return { 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

async function getUnreadMessageCount(recipientId) {
  // Por ahora no usamos mensajes no leídos reales.
  return 0;
}

module.exports = {
  sendPush,
  sendToAllExcept,
  sendChatNotification,
  getUnreadMessageCount
};