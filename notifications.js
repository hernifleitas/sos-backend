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
    const messages = validTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body,
      data,
      priority: 'high',
      _displayInForeground: true
    }));

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

module.exports = {
  sendPush,
  sendToAllExcept
};