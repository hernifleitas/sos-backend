const express = require('express');
const router = express.Router();
const authService = require('../auth');
const emailService = require('../email');
const database = require('../database');

// Ruta de registro
router.post('/register', async (req, res) => {
  try {
    console.log('Datos recibidos en registro:', req.body);
    const result = await authService.register(req.body);
    console.log('Resultado del registro:', result);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Ruta de login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Inicio de sesión exitoso',
        user: result.user,
        token: result.token
      });
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Ruta para verificar token
router.get('/verify', authService.authenticateToken.bind(authService), (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Ruta para actualizar perfil
router.put('/profile', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const result = await authService.updateProfile(req.user.id, req.body);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Ruta para cambiar contraseña
router.put('/change-password', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Ruta para solicitar reset de contraseña
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await authService.requestPasswordReset(email);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error solicitando reset de contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Ruta para reset de contraseña con token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const result = await authService.resetPasswordWithToken(token, newPassword);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error reseteando contraseña con token:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Rutas de administración
// Obtener usuarios pendientes
router.get('/admin/pending-users', authService.authenticateToken.bind(authService), authService.requireAdmin.bind(authService), async (req, res) => {
  try {
    const result = await authService.getPendingUsers();
    res.json(result);
  } catch (error) {
    console.error('Error obteniendo usuarios pendientes:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Aprobar usuario
router.post('/admin/approve-user/:userId', authService.authenticateToken.bind(authService), authService.requireAdmin.bind(authService), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await authService.approveUser(userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error aprobando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Rechazar usuario
router.post('/admin/reject-user/:userId', authService.authenticateToken.bind(authService), authService.requireAdmin.bind(authService), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await authService.rejectUser(userId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error rechazando usuario:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// Ruta para hacer administrador (solo para desarrollo)
router.post('/admin/make-admin/:userId', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await database.makeAdmin(userId);
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: 'Usuario promovido a administrador'
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }
  } catch (error) {
    console.error('Error promoviendo a administrador:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
