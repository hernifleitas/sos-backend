const express = require('express');
const router = express.Router();
const database = require('../database');
const jwt = require('jsonwebtoken');

// Middleware para verificar token JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Token de acceso requerido'
    });
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'rider-sos-secret-key-2024';
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Token inválido o expirado'
    });
  }
};

// Verificar estado premium de un usuario
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const premiumStatus = await database.isPremiumActive(userId);
    
    res.json({
      success: true,
      isPremium: premiumStatus.isPremium,
      type: premiumStatus.type,
      expiresAt: premiumStatus.expiresAt || null,
      subscription: premiumStatus.subscription || null
    });
  } catch (error) {
    console.error('Error verificando estado premium:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Obtener historial de suscripciones del usuario
router.get('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const subscriptions = await database.getUserSubscriptions(userId);
    
    res.json({
      success: true,
      subscriptions: subscriptions
    });
  } catch (error) {
    console.error('Error obteniendo suscripciones:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Crear nueva suscripción premium (para iniciar proceso de pago)
router.post('/create-subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { preference_id } = req.body;
    
    if (!preference_id) {
      return res.status(400).json({
        success: false,
        message: 'preference_id es requerido'
      });
    }
    
    const mercadopagoData = {
      preference_id: preference_id,
      amount: 5000.00,
      currency: 'ARS'
    };
    
    const result = await database.createPremiumSubscription(userId, mercadopagoData);
    
    res.json({
      success: true,
      subscription: result.subscription,
      message: 'Suscripción creada exitosamente'
    });
  } catch (error) {
    console.error('Error creando suscripción:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Verificar estado premium por user ID (para admin)
router.get('/status/:userId', authenticateToken, async (req, res) => {
  try {
    // Verificar si el usuario es admin
    const isAdmin = await database.isAdmin(req.user.id);
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo administradores pueden acceder'
      });
    }
    
    const { userId } = req.params;
    const premiumStatus = await database.isPremiumActive(userId);
    
    res.json({
      success: true,
      userId: userId,
      isPremium: premiumStatus.isPremium,
      type: premiumStatus.type,
      expiresAt: premiumStatus.expiresAt || null,
      subscription: premiumStatus.subscription || null
    });
  } catch (error) {
    console.error('Error verificando estado premium:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
