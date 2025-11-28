const database = require('./database');

// Mejorar la compatibilidad con fetch
let fetchFn;
if (typeof global.fetch === 'function') {
  fetchFn = global.fetch;
} else {
  fetchFn = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPush(tokens, title, body, data = {}) {
  if (!tokens?.length) {
    console.log('No hay tokens para enviar notificación');
    return { success: true, sent: 0 };
  }

  // Filtrar tokens inválidos
  const validTokens = tokens.filter(token => 
    token && typeof token === 'string' && token.startsWith('ExponentPushToken')
  );

  if (validTokens.length === 0) {
    console.error('No hay tokens válidos para enviar');
    return { success: false, sent: 0, error: 'No valid tokens' };
  }

  console.log(`Enviando notificación a ${validTokens.length} dispositivos`);

  try {
    const messages = validTokens.map(token => {
      const message = {
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        _displayInForeground: true
      };

      // Si es una notificación de chat, agregar agrupación
      if (data.chatId) {
        message.data = {
          ...message.data,
          _displayInForeground: true,
          _group: 'chat-messages',
          _groupSummary: true,
          _notificationId: `chat-${data.recipientId || 'group'}`,
          _count: data.unreadCount || 1,
          _sound: 'default',
          priority: 'high'
        };
      }

      return message;
    });

    const response = await fetchFn(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error en la respuesta de Expo:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      return { 
        success: false, 
        sent: 0, 
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: errorText
      };
    }

    return { success: true, sent: validTokens.length };
  } catch (error) {
    console.error('Error enviando notificación:', error);
    return { 
      success: false, 
      sent: 0, 
      error: error.message,
      stack: error.stack 
    };
  }
}

async function sendToAllExcept(userId, title, body, data = {}) {
  try {
    const tokens = await database.getAllTokensExcept(userId);
    
    if (!tokens?.length) {
      return { success: false, error: 'No tokens found' };
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
    return await sendPush(tokens, title, body, {
      chatId: message.chatId || 'general',
      senderId: message.senderId,
      message: message.text || '(Mensaje sin texto)',
      timestamp: message.createdAt || new Date().toISOString(),
      unreadCount,
      type: 'chat_message'
    });

  } catch (error) {
    console.error('Error en sendChatNotification:', error);
    return { 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

async function getUnreadMessageCount(recipientId) {
  try {
    const { rows } = await database.pool.query(
      'SELECT COUNT(*) FROM messages WHERE recipient_id = $1 AND read = false',
      [recipientId]
    );
    return parseInt(rows[0].count, 10) || 0;
  } catch (error) {
    console.error('Error contando mensajes no leídos:', error);
    return 0;
  }
}

module.exports = {
  sendPush,
  sendToAllExcept,
  sendChatNotification,
  getUnreadMessageCount
};