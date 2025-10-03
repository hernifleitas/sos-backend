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
  const { paymentId } = req.params;
  const userId = req.user.id;

  try {
    // Buscar pago
    const paymentRes = await database.query(
      `SELECT * FROM payments WHERE payment_id = $1 AND user_id = $2`,
      [paymentId, userId]
    );

    if (paymentRes.rowCount === 0) return res.status(404).json({ success: false, message: 'Pago no encontrado' });

    const payment = paymentRes.rows[0];
    if (payment.status !== 'approved') return res.status(400).json({ success: false, message: 'El pago no está aprobado' });

    // Crear o actualizar suscripción premium por 30 días
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const result = await database.query(
      `INSERT INTO premium_subscriptions (user_id, mercadopago_payment_id, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (user_id) DO UPDATE
       SET mercadopago_payment_id = $2, start_date = $3, end_date = $4, status = 'active'
       RETURNING id, end_date`,
      [userId, paymentId, startDate, endDate]
    );

    const subscriptionId = result.rows[0].id;

    // Relacionar payment con subscription
    await database.query(
      `UPDATE payments SET subscription_id = $1 WHERE payment_id = $2`,
      [subscriptionId, paymentId]
    );

    // Marcar usuario como premium
    await database.query(
      `UPDATE users SET is_premium = true WHERE id = $1`,
      [userId]
    );

    res.json({ success: true, expiresAt: result.rows[0].end_date });
  } catch (error) {
    console.error('Error activando premium:', error);
    res.status(500).json({ success: false, message: 'Error activando premium' });
  }
});

router.post('/create-subscription', authenticateToken, async (req, res) => {
  try {
    // Inicializar MercadoPago
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    // Crear preferencia de pago
    const result = await preference.create({
      body: {
        items: [
          {
            title: 'Suscripción Premium SOS Delivery',
            quantity: 1,
            unit_price: 5000, // precio en ARS
            currency_id: 'ARS'
          }
        ],
        metadata: {
          user_id: req.user.id
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/success.html`,
          failure: `${process.env.FRONTEND_URL}/failure.html`,
          pending: `${process.env.FRONTEND_URL}/pending.html`
        },
        auto_return: 'approved'
      }
    });

    // Guardar la preferencia en la base de datos como pending
    await database.query(
      `INSERT INTO payments (user_id, preference_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [req.user.id, result.id, 5000, 'ARS']
    );

    // Devolver URL de MercadoPago al frontend
    res.json({
      init_point: result.init_point,   // link para redireccionar
      preferenceId: result.id
    });

  } catch (error) {
    console.error('Error creando preferencia:', error);
    res.status(500).json({ success: false, message: 'Error creando preferencia' });
  }
});

// Webhook de MercadoPago
router.post('/webhook', async (req, res) => {
  const { id } = req.body; // id del pago enviado por MP

  try {
    if (!id) return res.status(400).send('Faltan datos');

    const accessToken = process.env.MP_ACCESS_TOKEN;

    // Consultar pago en MercadoPago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const paymentData = await mpResponse.json();

    if (!paymentData || !paymentData.status) return res.status(404).send('Pago no encontrado');

    const paymentStatus = paymentData.status; // approved, pending, rejected
    const userId = paymentData.metadata?.user_id;

    if (!userId) return res.status(400).send('No se pudo identificar al usuario');

    // Actualizar payment en DB
    await database.query(
      `UPDATE payments
       SET status = $1, payment_id = $2, updated_at = NOW()
       WHERE preference_id = $3`,
      [paymentStatus, paymentData.id, paymentData.preference_id]
    );

    // Si el pago está aprobado, crear o actualizar suscripción premium por 30 días
    if (paymentStatus === 'approved') {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 30); // 30 días exactos

      const result = await database.query(
        `INSERT INTO premium_subscriptions (user_id, mercadopago_payment_id, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id) DO UPDATE
         SET mercadopago_payment_id = $2, start_date = $3, end_date = $4, status = 'active'
         RETURNING id`,
        [userId, paymentData.id, startDate, endDate]
      );

      const subscriptionId = result.rows[0].id;

      // Relacionar payment con subscription
      await database.query(
        `UPDATE payments SET subscription_id = $1 WHERE payment_id = $2`,
        [subscriptionId, paymentData.id]
      );

      // Marcar usuario como premium
      await database.query(
        `UPDATE users SET is_premium = true WHERE id = $1`,
        [userId]
      );
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error webhook MP:', error);
    res.status(500).send('Error');
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
