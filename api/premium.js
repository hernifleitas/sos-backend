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

    // Llamada a MercadoPago para obtener info del pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });

    const payment = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Error obteniendo pago MP:", payment);
      return res.status(500).json({ success: false, message: 'Error verificando pago en MercadoPago' });
    }

    if (payment.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Pago no aprobado o pendiente' });
    }

    // Activar suscripción en la DB
    const result = await database.activatePremiumSubscription(payment.id, {
      payment_method_id: payment.payment_type_id,
      payment_type_id: payment.payment_type_id,
      payment_id: payment.id,
      amount: payment.transaction_amount,
      currency: payment.currency_id,
      status: 'approved',
      approved_at: payment.date_approved
    })

    res.json({
      success: true,
      message: 'Suscripción activada con éxito',
      expiresAt: result.endDate
    });

  } catch (error) {
    console.error('Error activando suscripción premium:', error);
    res.status(500).json({ success: false, message: 'Error interno al activar suscripción' });
  }
});

// Crear nueva suscripción premium (para iniciar proceso de pago) - Checkout Pro
router.post('/create-subscription', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const amount = 5000; // Monto en centavos (50.00 ARS)
    const currency = 'ARS';

    // 1️⃣ Crear preferencia de pago en MercadoPago
    const preference = {
      items: [{
        title: 'Suscripción Premium SOS Delivery',
        quantity: 1,
        currency_id: currency,
        unit_price: amount
      }],
      payer: {
        name: req.user.nombre,
        email: req.user.email
      },
      metadata: {
        user_id: userId
      },
      back_urls: {
        success: `${process.env.FRONTEND_URL}/premium/success`,
        failure: `${process.env.FRONTEND_URL}/premium/failure`,
        pending: `${process.env.FRONTEND_URL}/premium/pending`
      },
      auto_return: 'approved',
      notification_url: `${process.env.BACKEND_URL}/api/premium/webhook`
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify(preference)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Error al crear preferencia de pago');

    // 2️⃣ Guardar pago pendiente en la base de datos
    await database.savePaymentDetails({
      user_id: userId,
      preference_id: data.id,
      amount: amount,
      currency: currency,
      status: 'pending'
      // No incluimos mercadopago_payment_id porque aún no existe
    });

    // 3️⃣ Devolver la URL de pago
    res.json({
      success: true,
      preferenceId: data.id,
      init_point: data.init_point || null
    });

  } catch (error) {
    console.error('Error en create-subscription:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al crear la suscripción',
      error: error.message 
    });
  }
});

// Webhook de MercadoPago
router.post('/webhook', express.json(), async (req, res) => {
  try {
    const data = req.body.data || req.query;
    const paymentId = data.id || data['data.id'] || req.query.id;

    if (!paymentId) {
      console.error("❌ No llegó paymentId en webhook");
      return res.status(400).json({ success: false, message: "Falta paymentId" });
    }
    // Llamada a Mercado Pago para obtener info del pago
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
    });
    const payment = await response.json();
    console.log("✅ Detalles del pago:", payment);

    if (payment.status === 'approved') {
      const userId = payment.metadata?.userId;
      const preferenceId = payment.metadata?.preference_id;
      if (!userId || !preferenceId) return res.status(400).json({ success: false, message: "Falta userId o preferenceId" });

      const pendingPayment = await database.findPendingPaymentByPreference(preferenceId, userId);
      if (!pendingPayment) return res.status(404).json({ success: false, message: "Pago pendiente no encontrado" });  

      // Activar suscripción
      const result = await database.activatePremiumSubscription(pendingPayment.id, {
        payment_method: payment.payment_type_id,
        payment_type_id: payment.payment_type_id,
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
    const { months = 1 } = req.body; // Opcional: meses de suscripción

    // Calcular fechas
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + months);

    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Actualizar usuario a premium
      await client.query(`
        UPDATE users 
        SET role = 'premium',
            is_premium = true,
            premium_expires_at = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [endDate, userId]);

      // 2. Crear registro de pago simulado
      const paymentResult = await client.query(`
        INSERT INTO payments (
          user_id, 
          preference_id, 
          payment_id,
          amount,
          currency,
          status,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id
      `, [
        userId,
        'MANUAL-' + Date.now(),
        'MANUAL-PAY-' + Date.now(),
        5000,
        'ARS',
        'approved'
      ]);

      // 3. Crear suscripción
      await client.query(`
        INSERT INTO premium_subscriptions (
          user_id, 
          start_date, 
          end_date, 
          is_active,
          payment_id
        ) VALUES ($1, $2, $3, true, $4)
      `, [userId, startDate, endDate, paymentResult.rows[0].id]);

      await client.query('COMMIT');

      res.json({
        success: true,
        message: '¡Premium activado manualmente!',
        expiresAt: endDate
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error en activate-manual:', error);
    res.status(500).json({
      success: false,
      message: 'Error al activar premium'
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
