const express = require('express');
const router = express.Router();

// Endpoint para registrar eventos de analytics
router.post('/event', (req, res) => {
  const { eventName, eventData } = req.body;

  // Loggear el evento en el servidor
  console.log(`[Analytics] Evento recibido: ${eventName}`, eventData);

  // Aquí se podría guardar el evento en una base de datos o enviarlo a un servicio de analytics

  res.status(200).json({ success: true, message: 'Evento registrado con éxito' });
});

module.exports = router;
