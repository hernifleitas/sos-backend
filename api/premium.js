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
    const premiumStatus = await database.isPremium(userId);
    
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

// Activar suscripción después del pago
router.post('/activate/:paymentId', authenticateToken, async (req, res) => {
  try {
    const { paymentId } = req.params;

    const paymentData = {
      payment_method: 'mercadopago',
      preference_id: req.body.preference_id || null
    };

    const result = await database.activatePremiumSubscription(paymentId, paymentData);

    res.json({
      success: true,
      message: 'Suscripción activada con éxito',
      expiresAt: result.endDate
    });
  } catch (error) {
    console.error('Error activando suscripción premium:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno al activar suscripción'
    });
  }
});

// Crear nueva suscripción premium (para iniciar proceso de pago) - Checkout Pro
router.post('/create-subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1️⃣ Crear objeto preference para Checkout Pro
    const preference = {
      items: [
        { title: "Premium SOS", quantity: 1, unit_price: 5000 }
      ],
      back_urls: {
        success: "https://sos-backend-8cpa.onrender.com/premium/success",
        failure: "https://sos-backend-8cpa.onrender.com/premium/failure",
        pending: "https://sos-backend-8cpa.onrender.com/premium/pending"
      },
      notification_url: "https://sos-backend-8cpa.onrender.com/premium/webhook",
      auto_return: "approved",
      metadata: { userId }
    };

    // 2️⃣ Llamar a la API de MercadoPago
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify(preference)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Error creando preferencia MP:", data);
      return res.status(500).json({ success: false, message: 'Error creando preferencia de pago' });
    }

    // 3️⃣ Guardar en DB la suscripción pendiente
    const subscription = await database.makePremium(userId, 1); // month

    // Guardar detalles del pago si es necesario
    await database.savePaymentDetails({
      user_id: userId,
      preference_id: data.id,
      amount: 5000,
      currency: 'ARS',
      subscription_id: subscription.id 
    });
    
    res.json({ success: true, init_point: data.init_point, preferenceId: data.id });

  } catch (error) {
    console.error("Error en create-subscription:", error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Webhook de MercadoPago
router.post('/webhook', express.json(), async (req, res) => {
  try {
    // 1. Obtener datos de la notificación
    const data = req.body;
    
    // 2. Manejar diferentes formatos de notificación de MercadoPago
    let paymentId;
    
    // Si es una notificación de pago directa
    if (data.id) {
      paymentId = data.id;
    } 
    // Si es una notificación de webhook (data contiene el ID del pago)
    else if (data.data && data.data.id) {
      paymentId = data.data.id;
    }
    // Si viene como query param (para pruebas)
    else if (req.query.id) {
      paymentId = req.query.id;
    }

    if (!paymentId) {
      console.error("❌ No se pudo obtener el ID de pago de la notificación");
      console.log("Datos recibidos:", JSON.stringify(req.body, null, 2));
      return res.status(400).json({ success: false, message: "ID de pago no proporcionado" });
    }

    console.log(`🔔 Notificación recibida para pago: ${paymentId}`);

    // Llamada a Mercado Pago para obtener info del pago
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await response.json();
    console.log("✅ Detalles del pago:", payment);

    if (payment.status === 'approved') {
      const userId = payment.metadata?.userId;
      if (!userId) return res.status(400).json({ success: false, message: "Falta userId" });

      // Activar suscripción
      const result = await database.activatePremiumSubscription(userId, {
        payment_method: payment.payment_type_id,
        preference_id: payment.metadata?.preference_id || null,
        payment_id: payment.id,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        status: payment.status,
        approved_at: payment.date_approved
      });

      console.log(`⭐ Usuario ${userId} activado como PREMIUM hasta ${result.endDate}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).json({ success: false });
  }
});

// 🧪 RUTA DE PRUEBA: Activar premium manualmente (SOLO DESARROLLO)
router.post('/activate-manual', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Crear suscripción manual por 30 días
    const result = await database.activatePremiumSubscription(userId, {
      payment_method: 'manual',
      preference_id: 'MANUAL-' + Date.now(),
      payment_id: 'MANUAL-PAYMENT-' + Date.now(),
      amount: 5000,
      currency: 'ARS',
      status: 'approved',
      approved_at: new Date().toISOString()
    });

    console.log(`✅ Usuario ${userId} activado como PREMIUM manualmente hasta ${result.endDate}`);

    res.json({
      success: true,
      message: '¡Premium activado manualmente!',
      expiresAt: result.endDate,
      isPremium: true
    });
  } catch (error) {
    console.error('Error activando premium manual:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error interno del servidor'
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
    const premiumStatus = await database.isPremium(userId);
    
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
