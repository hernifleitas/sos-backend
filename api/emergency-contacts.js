const express = require('express');
const router = express.Router();
const database = require('../database');

// Importar el servicio de autenticación existente
const { authService } = require('./auth');

// Middleware para verificar autenticación usando tu sistema existente
router.use(authService.authenticateToken.bind(authService));

// Obtener contactos de emergencia del usuario
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const contacts = await database.getEmergencyContacts(userId);
    
    // Obtener rol del usuario para determinar límite
    const userResult = await database.pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
const maxContacts = user && user.role === 'premium' ? 3 : 1;
    
    res.json({
      success: true,
      contacts,
      maxContacts
    });
  } catch (error) {
    console.error('Error obteniendo contactos de emergencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener contactos de emergencia'
    });
  }
});

// Agregar nuevo contacto de emergencia
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { nombre, telefono, relacion } = req.body;

    // Validar datos
    if (!nombre || !telefono || !relacion) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Validar formato del teléfono (simplificado)
    const phoneRegex = /^[0-9+\-\s()]+$/;
    if (!phoneRegex.test(telefono)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de teléfono inválido'
      });
    }

    // Obtener usuario para verificar rol y límite
    const userResult = await database.pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    
    // Determinar límite según rol
    const maxContacts = user.role === 'premium' ? 3 : 1;
    
    // Obtener contactos existentes
    const existingContacts = await database.getEmergencyContacts(userId);
    
    // Validar límite
    if (existingContacts.length >= maxContacts) {
      return res.status(400).json({
        success: false,
        message: `Límite alcanzado. Máximo ${maxContacts} contactos de emergencia permitidos para tu plan.`
      });
    }

    // Guardar contacto
    const result = await database.pool.query(
      'INSERT INTO emergency_contacts (user_id, nombre, telefono, relacion) VALUES ($1, $2, $3) RETURNING *',
      [userId, nombre, telefono, relacion]
    );

    // 📱 ENVIAR MENSAJE DE VERIFICACIÓN AUTOMÁTICO
    try {
      const whatsappService = require('../services/whatsapp');
      const userName = req.user.nombre || req.user.email;
      
      await whatsappService.sendInvitationMessage(
        telefono,
        userName,
        nombre
      );
      
      console.log(`📱 Invitación enviada a ${telefono} para ser contacto de emergencia`);
    } catch (whatsappError) {
      console.error('❌ Error enviando invitación:', whatsappError.message);
      // No fallar el guardado si WhatsApp falla
    }

    res.json({
      success: true,
      message: 'Contacto agregado. Se envió un mensaje de verificación.',
      contact: result.rows[0]
    });
  } catch (error) {
    console.error('Error agregando contacto de emergencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al agregar contacto de emergencia'
    });
  }
});

// Actualizar contacto de emergencia
router.put('/:contactId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;
    const { nombre, telefono, relacion } = req.body;

    // Validar datos
    if (!nombre || !telefono || !relacion) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Validar formato del teléfono
    const phoneRegex = /^[0-9+\-\s()]+$/;
    if (!phoneRegex.test(telefono)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de teléfono inválido'
      });
    }

    const contact = await database.updateEmergencyContact(contactId, {
      nombre,
      telefono,
      relacion
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contacto de emergencia no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Contacto de emergencia actualizado exitosamente',
      contact
    });
  } catch (error) {
    console.error('Error actualizando contacto de emergencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al actualizar contacto de emergencia'
    });
  }
});

// Eliminar (desactivar) contacto de emergencia
router.delete('/:contactId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactId } = req.params;

    const result = await database.deleteEmergencyContact(contactId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Contacto de emergencia no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Contacto de emergencia eliminado exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando contacto de emergencia:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar contacto de emergencia'
    });
  }
});

module.exports = router;
