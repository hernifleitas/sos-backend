// auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const database = require('./database');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'rider-sos-secret-key-2024';
    this.jwtExpiresIn = '7d'; // Token válido por 7 días
  }

  // Helper: verificar si es Premium (o Admin)
  async isPremium(userId) {
    try {
      return await database.isPremium(userId);
    } catch (_) {
      return false;
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
      nombre: user.nombre
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
      const { nombre, email, password, moto, color } = userData;

      // Verificar si el email ya existe
      const existingUser = await database.findUserByEmail(email);
      if (existingUser) {
        return {
          success: false,
          message: 'Este email ya está registrado'
        };
      }

      // Validar datos
      if (!nombre || !email || !password || !moto || !color) {
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
        color: color.trim()
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
          created_at: newUser.created_at,
          status: 'pending'
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
          created_at: user.created_at,
          role: user.role || 'user'
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
          created_at: user.created_at,
          role: user.role || 'user'
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
        const emailService = require('./email');
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

  async getAllUsers() {
    try {
      const users = await database.getAllUsers();
      return {
        success: true,
        users
      };
    } catch (error) {
      console.error('Error obteniendo todos los usuarios:', error);
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
          const emailService = require('./email');
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
    try {
      const result = await database.rejectUser(userId);
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
          const emailService = require('./email');
          await emailService.sendRejectionEmail(user);
          console.log(`Email de rechazo enviado a ${user.email}`);
        } catch (emailError) {
          console.error('Error enviando email de rechazo:', emailError);
        }
      }

      return {
        success: true,
        message: 'Usuario rechazado correctamente'
      };
    } catch (error) {
      console.error('Error rechazando usuario:', error);
      return {
        success: false,
        message: 'Error interno del servidor'
      };
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



module.exports = new AuthService();
