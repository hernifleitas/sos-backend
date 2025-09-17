// notifications.js
const database = require('./database');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendPush(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return { success: true, sent: 0 };
  const chunks = [];
  const CHUNK_SIZE = 90; // Expo recomienda ~100 por request
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    chunks.push(tokens.slice(i, i + CHUNK_SIZE));
  }

  let sent = 0;
  for (const chunk of chunks) {
    try {
      const messages = chunk.map((to) => ({ to, title, body, data, sound: 'default', priority: 'high' }));
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error('Expo push error:', res.status, txt);
        continue;
      }
      sent += chunk.length;
    } catch (e) {
      console.error('Error enviando push a Expo:', e);
    }
  }
  return { success: true, sent };
}

async function sendToAllExcept(userId, title, body, data = {}) {
  try {
    const tokens = await database.getAllTokensExcept(userId);
    return await sendPush(tokens, title, body, data);
  } catch (e) {
    console.error('Error obteniendo tokens para push:', e);
    return { success: false };
  }
}

module.exports = {
  sendPush,
  sendToAllExcept,
};
