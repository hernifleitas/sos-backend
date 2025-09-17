const express = require('express');
const router = express.Router();
const authService = require('../auth');
const database = require('../database');

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

module.exports = router;
