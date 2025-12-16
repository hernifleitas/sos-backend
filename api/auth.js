const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('../database');
const emailService = require('../email');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET
    this.jwtExpiresIn = '7d'; // Token válido por 7 días
  }


  async requireGomero(req, res, next) {
  try {
    const user = await database.findUserById(req.user.id);
    if (user.role !== 'gomero') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo gomeros pueden acceder a esta función'
      });
    }
    next();
  } catch (error) {
    console.error('Error verificando rol de gomero:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}
// Middleware para verificar si es gomero o staff
async requireGomeroOrStaff(req, res, next) {
  try {
    const user = await database.findUserById(req.user.id);
    if (user.role !== 'gomero' && user.role !== 'staff') {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Se requiere ser gomero o administrador'
      });
    }
    next();
  } catch (error) {
    console.error('Error verificando permisos de gomero/admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}
 
  // Helper: verificar si es Premium (o Admin)
  async isPremium(userId) {
    try {
      return await database.isPremium(userId);
    } catch (_) {
      return false;
    }
  }

   async checkPremiumStatus() {
    try {
      const token = await this.getToken();
      if (!token) return { isPremium: false, needsRefresh: false };
      
      const response = await fetch(`${BACKEND_URL}/api/auth/check-status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.status === 401) {
        // Token inválido o expirado
        await this.logout();
        return { isPremium: false, needsRefresh: true };
      }
      
      const data = await response.json();
      return { isPremium: data.isPremium, needsRefresh: false };
    } catch (error) {
      console.error('Error verificando estado premium:', error);
      return { isPremium: false, needsRefresh: false };
    }
  }

  // Generar hash de contraseña
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verificar contraseña
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Generar JWT token
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      role: user.role || 'user'
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }

  // Verificar JWT token
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      return null;
    }
  }

  // Registrar nuevo usuario
  async register(userData) {
    try {
      console.log('Datos recibidos en authService.register:', userData);
      const { nombre, email, password, moto, color, telefono } = userData;

      // Verificar si el email ya existe
      const existingUser = await database.findUserByEmail(email);
      if (existingUser) {
        return {
          success: false,
          message: 'Este email ya está registrado'
        };
      }

      // Validar datos
      if (!nombre || !email || !password || !moto || !color || !telefono) {
        return {
          success: false,
          message: 'Todos los campos son requeridos'
        };
      }

      if (password.length < 6) {
        return {
          success: false,
          message: 'La contraseña debe tener al menos 6 caracteres'
        };
      }

      // Hash de la contraseña
      const hashedPassword = await this.hashPassword(password);

      // Crear usuario en la base de datos (estado pendiente por defecto)
      const newUser = await database.createUser({
        nombre: nombre.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        moto: moto.trim(),
        color: color.trim(),
        telefono: telefono.trim()
      });

      return {
        success: true,
        message: 'Registro exitoso. Tu cuenta está pendiente de aprobación por un administrador. Te notificaremos por email cuando sea aprobada.',
        user: {
          id: newUser.id,
          nombre: newUser.nombre,
          email: newUser.email,
          moto: newUser.moto,
          color: newUser.color,
          telefono: newUser.telefono,
          created_at: newUser.created_at,
          status: 'pending',
        }
        
      };
      
    } catch (error) {
      console.error('Error en registro:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  // Iniciar sesión
  async login(email, password) {
    try {
      // Buscar usuario por email
      const user = await database.findUserByEmail(email);
      if (!user) {
        return {
          success: false,
          message: 'Email o contraseña incorrectos'
        };
      }

      // Verificar estado de aprobación
      if (user.status === 'pending') {
        return {
          success: false,
          message: 'Tu cuenta está en revisión por un administrador. Te avisaremos cuando se apruebe y podrás iniciar sesión.'
        };
      }

      if (user.status === 'rejected') {
        return {
          success: false,
          message: 'Tu cuenta fue rechazada. Si crees que es un error, contacta al administrador.'
        };
      }

      // Verificar contraseña
      const isValidPassword = await this.verifyPassword(password, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          message: 'Email o contraseña incorrectos'
        };
      }

      // Generar token
      const token = this.generateToken(user);

      return {
        success: true,
        message: 'Inicio de sesión exitoso',
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          moto: user.moto,
          color: user.color,
          telefono: user.telefono,
          created_at: user.created_at,
          role: user.role || 'user',

        },
        token
      };
    } catch (error) {
      console.error('Error en login:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  // Verificar token y obtener usuario
  async verifyUser(token) {
    try {
      const decoded = this.verifyToken(token);
      if (!decoded) {
        return {
          success: false,
          message: 'Token inválido o expirado'
        };
      }

      const user = await database.findUserById(decoded.id);
      if (!user) {
        return {
          success: false,
          message: 'Usuario no encontrado'
        };
      }

      return {
        success: true,
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          moto: user.moto,
          color: user.color,
          telefono: user.telefono,
          created_at: user.created_at,
          role: user.role || 'user',

        }
      };
    } catch (error) {
      console.error('Error verificando usuario:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  // Middleware para verificar autenticación
  authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acceso requerido'
      });
    }

    const decoded = this.verifyToken(token);
    if (!decoded) {
      return res.status(403).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }

    req.user = decoded;
    next();
  }

  // Middleware para verificar si es administrador
  async requireAdmin(req, res, next) {
    try {
      const isAdmin = await database.isAdmin(req.user.id);
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Acceso denegado. Solo administradores pueden acceder a esta función'
        });
      }
      next();
    } catch (error) {
      console.error('Error verificando permisos de administrador:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }


  // Middleware para verificar si es staff
async requireStaff(req, res, next) {
  try {
    const isStaff = await database.isStaff(req.user.id);
    if (!isStaff) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo Staff puede acceder a esta función'
      });
    }
    next();
  } catch (error) {
    console.error('Error verificando permisos de staff:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}

// Middleware para verificar si es staff o admin
async requireStaffOrAdmin(req, res, next) {
  try {
    const hasAccess = await database.isStaffOrAdmin(req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado. Solo Staff o Administradores pueden acceder'
      });
    }
    next();
  } catch (error) {
    console.error('Error verificando permisos de staff/admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
}
  

  // Actualizar perfil de usuario
  async updateProfile(userId, updateData) {
    try {
      const { nombre, moto, color } = updateData;

      // Validar datos
      if (!nombre || !moto || !color) {
        return {
          success: false,
          message: 'Todos los campos son requeridos'
        };
      }

      const result = await database.updateUser(userId, {
        nombre: nombre.trim(),
        moto: moto.trim(),
        color: color.trim()
      });

      if (result.changes === 0) {
        return {
          success: false,
          message: 'Usuario no encontrado'
        };
      }

      // Obtener usuario actualizado
      const updatedUser = await database.findUserById(userId);

      return {
        success: true,
        message: 'Perfil actualizado correctamente',
        user: {
          id: updatedUser.id,
          nombre: updatedUser.nombre,
          email: updatedUser.email,
          moto: updatedUser.moto,
          color: updatedUser.color,
          updated_at: updatedUser.updated_at
        }
      };
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  // Solicitar reset de contraseña
  async requestPasswordReset(email) {
    try {
      // Buscar usuario por email
      const user = await database.findUserByEmail(email);
      if (!user) {
        return {
          success: false,
          message: 'Email no encontrado en el sistema'
        };
      }

      // Verificar que el usuario esté aprobado
      if (user.status !== 'approved') {
        return {
          success: false,
          message: 'Tu cuenta aún no ha sido aprobada por un administrador'
        };
      }

      // Generar token de reset
      const resetToken = this.generateResetToken();
      const expiresAt = new Date(Date.now() + 3600000); // 1 hora

      // Guardar token en la base de datos
      await database.saveResetToken(email, resetToken, expiresAt);

      // Enviar email con el link de reset
      try {
        await emailService.sendPasswordResetLinkEmail(user, resetToken);
        console.log(`Link de reset enviado a ${user.email}`);
      } catch (emailError) {
        console.error('Error enviando email de reset:', emailError);
        return {
          success: false,
          message: 'Error enviando email de verificación'
        };
      }

      return {
        success: true,
        message: 'Se ha enviado un link a tu email para cambiar la contraseña'
      };
    } catch (error) {
      console.error('Error solicitando reset de contraseña:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  // Reset de contraseña con token
  async resetPasswordWithToken(token, newPassword) {
    try {
      // Buscar usuario por token
      const user = await database.findUserByResetToken(token);
      if (!user) {
        return {
          success: false,
          message: 'Token inválido o expirado'
        };
      }

      // Validar nueva contraseña
      if (newPassword.length < 6) {
        return {
          success: false,
          message: 'La nueva contraseña debe tener al menos 6 caracteres'
        };
      }

      // Hash de la nueva contraseña
      const hashedPassword = await this.hashPassword(newPassword);

      // Actualizar contraseña en la base de datos
      const result = await database.updateUserPassword(user.id, hashedPassword);

      if (result.changes === 0) {
        return {
          success: false,
          message: 'Error actualizando contraseña'
        };
      }

      // Limpiar token de reset
      await database.clearResetToken(user.id);

      return {
        success: true,
        message: 'Contraseña actualizada correctamente'
      };
    } catch (error) {
      console.error('Error reseteando contraseña con token:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  // Generar token de reset
  generateResetToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  // Generar contraseña aleatoria
  generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  // Sistema de aprobación de usuarios
  async getPendingUsers() {
    try {
      const users = await database.getPendingUsers();
      return {
        success: true,
        users
      };
    } catch (error) {
      console.error('Error obteniendo usuarios pendientes:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  async approveUser(userId) {
    try {
      const result = await database.approveUser(userId);
      if (result.changes === 0) {
        return {
          success: false,
          message: 'Usuario no encontrado'
        };
      }

      // Obtener datos del usuario para enviar email
      const user = await database.findUserById(userId);
      if (user) {
        try {
          await emailService.sendApprovalEmail(user);
          console.log(`Email de aprobación enviado a ${user.email}`);
        } catch (emailError) {
          console.error('Error enviando email de aprobación:', emailError);
        }
      }

      return {
        success: true,
        message: 'Usuario aprobado correctamente'
      };
    } catch (error) {
      console.error('Error aprobando usuario:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }

  async rejectUser(userId) {
    console.log('rejectUser iniciado para userId:', userId);
  
    try {
      // 1️⃣ Obtener datos del usuario antes de marcarlo como rechazado
      const user = await database.findUserById(userId);
      if (!user) {
        console.log('Usuario no encontrado antes de intentar rechazar');
        return { success: false, message: 'Usuario no encontrado' };
      }
      console.log('Usuario encontrado:', user);
  
      // 2️⃣ Marcar al usuario como rechazado en la base de datos
      const result = await database.rejectUser(userId);
      console.log('Resultado de rejectUser en DB:', result);
  
      if (result.changes === 0) {
        console.log('No se pudo marcar usuario como rechazado');
        return { success: false, message: 'Usuario no encontrado o no modificado' };
      }
  
      // 3️⃣ Enviar email de rechazo usando los datos obtenidos antes
      try {
        await emailService.sendRejectionEmail(user);
        console.log(`Email de rechazo enviado a ${user.email}`);
      } catch (emailError) {
        console.error('Error enviando email de rechazo:', emailError);
      }
  
      return { success: true, message: 'Usuario rechazado correctamente' };
    } catch (error) {
      console.error('Error rechazando usuario:', error);
      return { success: false, message: 'Error interno del servidor' };
    }
  }

  // Cambiar contraseña
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Obtener usuario
      const user = await database.findUserById(userId);
      if (!user) {
        return {
          success: false,
          message: 'Usuario no encontrado'
        };
      }

      // Verificar contraseña actual
      const isValidPassword = await this.verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          message: 'Contraseña actual incorrecta'
        };
      }

      // Validar nueva contraseña
      if (newPassword.length < 6) {
        return {
          success: false,
          message: 'La nueva contraseña debe tener al menos 6 caracteres'
        };
      }

      // Hash de la nueva contraseña
      const hashedNewPassword = await this.hashPassword(newPassword);

      // Actualizar contraseña en la base de datos
      const result = await database.updateUser(userId, {
        password: hashedNewPassword
      });

      if (result.changes === 0) {
        return {
          success: false,
          message: 'Error actualizando contraseña'
        };
      }

      return {
        success: true,
        message: 'Contraseña actualizada correctamente'
      };
    } catch (error) {
      console.error('Error cambiando contraseña:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
    }
  }
}

// Crear instancia del servicio
const authService = new AuthService();



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
router.get('/verify', authService.authenticateToken.bind(authService), async (req, res) => {
  try {
    // Obtener datos actualizados del usuario desde la base de datos
    const database = require('../database');
    const userResult = await database.pool.query(
      'SELECT id, nombre, email, moto, color, role, telefono, created_at, premium_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        moto: user.moto,
        color: user.color,
        role: user.role, // Este es el role actualizado desde la DB
        telefono: user.telefono,
        created_at: user.created_at,
        premium_expires_at: user.premium_expires_at
      }
    });
  } catch (error) {
    console.error('Error en /verify:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
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

router.get('/check-status',
  authService.authenticateToken.bind(authService),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const isPremium = await database.isPremium(userId);
      res.json({ isPremium });
    } catch (error) {
      console.error('Error verificando estado:', error);
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  }
);

router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token requerido' });
    }

    // Verificar token existente
    const decoded = authService.verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }

    // Obtener datos actualizados del usuario
    const user = await database.findUserById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }

    // Generar nuevo token
    const newToken = authService.generateToken(user);

    res.json({
      success: true,
      token: newToken,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        moto: user.moto,
        color: user.color,
        role: user.role,
        telefono: user.telefono,
        created_at: user.created_at,
        premium_expires_at: user.premium_expires_at
      }
    });
  } catch (error) {
    console.error('Error en /refresh:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
});

// Obtener usuarios pendientes
router.get('/admin/pending-users',
  authService.authenticateToken.bind(authService),
  authService.requireStaffOrAdmin.bind(authService),
  async (req, res) => {
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
router.post('/admin/approve-user/:userId', authService.authenticateToken.bind(authService), authService.requireStaffOrAdmin.bind(authService), async (req, res) => {
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
router.post('/admin/reject-user/:userId', authService.authenticateToken.bind(authService), authService.requireStaffOrAdmin.bind(authService), async (req, res) => {
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

// Obtener todos los usuarios (admin)
router.get('/admin/all-users',
  authService.authenticateToken.bind(authService),
  authService.requireStaff.bind(authService),
  async (req, res) => {
    try {
      const result = await database.pool.query(
        `SELECT id, nombre, email, telefono, moto, color, role, 
                is_active, created_at, premium_expires_at 
         FROM users 
         WHERE is_active = true
         ORDER BY created_at DESC`
      );

      res.json({
        success: true,
        users: result.rows
      });
    } catch (error) {
      console.error('Error obteniendo todos los usuarios:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  });

// Hacer premium a un usuario (admin)
router.post('/admin/make-premium/:userId',
  authService.authenticateToken.bind(authService),
  authService.requireStaff.bind(authService),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { days = 30 } = req.body;

      // Calcular fechas
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + days);

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

        // 2. Crear registro de pago simulado (admin)
        const paymentResult = await client.query(`
          INSERT INTO payments (
            user_id, 
            preference_id, 
            mercadopago_payment_id,
            amount,
            currency,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          RETURNING id
        `, [
          userId,
          'ADMIN-' + Date.now(),
          'ADMIN-PAY-' + Date.now(),
          0,
          'ARS',
          'approved'
        ]);

        // 3. Crear suscripción (sin payment_id ya que no existe esa columna)
        await client.query(`
          INSERT INTO premium_subscriptions (
            user_id, 
            start_date, 
            end_date, 
            is_active,
            mercadopago_payment_id
          ) VALUES ($1, $2, $3, true, $4)
        `, [userId, startDate, endDate, 'ADMIN-PAY-' + Date.now()]);

        await client.query('COMMIT');

        res.json({
          success: true,
          message: `Premium activado por ${days} días`,
          expiresAt: endDate
        });

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }

    } catch (error) {
      console.error('Error haciendo premium al usuario:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: error.message
      });
    }
  });

  // Ruta para que un admin pueda hacer gomero a un usuario
router.post('/admin/make-gomero/:userId',
  authService.authenticateToken.bind(authService),
  authService.requireAdmin.bind(authService),
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      // Actualizar el rol del usuario a 'gomero'
      const result = await database.updateUserRole(userId, 'gomero');
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }
      res.json({
        success: true,
        message: 'Usuario actualizado a gomero exitosamente'
      });
    } catch (error) {
      console.error('Error actualizando a gomero:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
);
// Ruta para que un staff pueda quitar el rol gomero
router.post('/admin/remove-gomero/:userId',
  authService.authenticateToken.bind(authService),
  authService.requireStaff.bind(authService),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await database.updateUserRole(userId, 'user');
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }
      res.json({
        success: true,
        message: 'Rol gomero removido exitosamente'
      });
    } catch (error) {
      console.error('Error removiendo rol gomero:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
);
// Ruta para obtener todos los gomeros
router.get('/gomeros',
  authService.authenticateToken.bind(authService),
  authService.requireStaff.bind(authService),
  async (req, res) => {
    try {
      const gomeros = await database.getUsersByRole('gomero');
      res.json({
        success: true,
        gomeros
      });
    } catch (error) {
      console.error('Error obteniendo gomeros:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
);

router.post('/activate', async (req, res) => {
  try {
    const { userId, paymentId } = req.body;

    if (!userId || !paymentId) {
      return res.status(400).json({ error: 'Faltan datos (userId o paymentId)' });
    }

    // verificar que ese pago exista y esté aprobado
    const pago = await database.findPaymentById(paymentId, userId);

    if (!pago || pago.status !== 'approved') {
      return res.status(400).json({ error: 'Pago no encontrado o no aprobado' });
    }

    // activar la suscripción premium
    await database.activatePremiumSubscription(userId, paymentId);

    res.json({ success: true, message: 'Premium activado con éxito' });
  } catch (error) {
    console.error('Error activando suscripción premium:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/gomeriamovil',
  authService.authenticateToken.bind(authService),
  authService.requireGomero.bind(authService),
  (req, res) => {
    // Solo gomeros pueden acceder aquí
    res.json({ message: 'Acceso permitido para gomeros' });
  }
);

module.exports = { router, authService }
