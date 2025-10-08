  const nodemailer = require('nodemailer');
  require('dotenv').config();
  class EmailService {
    constructor() {
      this.transporter = null;
      this.init();
    }
    init() {
      this.transporter = nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false, // true para 465
        auth: {
          user: process.env.BREVO_SMTP_USER, 
          pass: process.env.BREVO_SMTP_KEY,
        },

        connectionTimeout: 10000
      });

      // Verificar la configuración
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('Error configurando email:', error);
        } else {
          console.log('✅ Servidor de email listo para enviar mensajes');
        }
      });
    }

    // Enviar email de reset de contraseña
    async sendPasswordResetEmail(user, newPassword) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_FROM,
          to: user.email,
          subject: '🔐 Nueva Contraseña - Rider SOS',
          html: this.generatePasswordResetEmailHTML(user, newPassword),
          text: this.generatePasswordResetEmailText(user, newPassword)
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log('Email de reset de contraseña enviado:', result.messageId);
        return result;
      } catch (error) {
        console.error('Error enviando email de reset:', error);
        throw error;
      }
    }

    // Enviar email de bienvenida
    async sendWelcomeEmail(user) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_FROM || 'Rider SOS <noreply@ridersos.com>',
          to: user.email,
          subject: '🚀 ¡Bienvenido a Rider SOS!',
          html: this.generateWelcomeEmailHTML(user),
          text: this.generateWelcomeEmailText(user)
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log('Email de bienvenida enviado:', result.messageId);
        return result;
      } catch (error) {
        console.error('Error enviando email de bienvenida:', error);
        throw error;
      }
    }

    // Enviar email con link de reset de contraseña
    async sendPasswordResetLinkEmail(user, resetToken) {
      try {
        // FORZAR deep link a la app SIEMPRE (evitar https://localhost u otras webs)
        const appScheme = process.env.APP_SCHEME || 'ridersos';
        const resetLink = `${appScheme}://reset-password?token=${resetToken}`;
        
        const mailOptions = {
          from: process.env.EMAIL_FROM || 'Rider SOS <noreply@ridersos.com>',
          to: user.email,
          subject: 'Rider SOS',
          html: this.generatePasswordResetLinkEmailHTML(user, resetLink),
          text: this.generatePasswordResetLinkEmailText(user, resetLink)
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log('Email de reset de contraseña enviado:', result.messageId);
        return result;
      } catch (error) {
        console.error('Error enviando email de reset:', error);
        throw error;
      }
    }

    // Enviar email de aprobación de cuenta
    async sendApprovalEmail(user) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_FROM || 'Rider SOS <noreply@ridersos.com>',
          to: user.email,
          subject: '✅ ¡Tu cuenta ha sido aprobada! - Rider SOS',
          html: this.generateApprovalEmailHTML(user),
          text: this.generateApprovalEmailText(user)
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log('Email de aprobación enviado:', result.messageId);
        return result;
      } catch (error) {
        console.error('Error enviando email de aprobación:', error);
        throw error;
      }
    }

    // Enviar email de rechazo de cuenta
    async sendRejectionEmail(user) {
      try {
        const mailOptions = {
          from: process.env.EMAIL_FROM || 'Rider SOS <noreply@ridersos.com>',
          to: user.email,
          subject: '❌ Registro no aprobado - Rider SOS',
          html: this.generateRejectionEmailHTML(user),
          text: this.generateRejectionEmailText(user)
        };

        const result = await this.transporter.sendMail(mailOptions);
        console.log('Email de rechazo enviado:', result.messageId);
        return result;
      } catch (error) {
        console.error('Error enviando email de rechazo:', error);
        throw error;
      }
    }

    // Generar HTML del email de reset de contraseña
    generatePasswordResetEmailHTML(user, newPassword) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nueva Contraseña - Rider SOS</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 20px 0; }
            .password-box { background: #f8f9fa; border: 2px solid #e74c3c; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0; }
            .password { font-size: 24px; font-weight: bold; color: #e74c3c; letter-spacing: 2px; font-family: monospace; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
            .button { display: inline-block; background: #e74c3c; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Nueva Contraseña</h1>
              <p>Rider SOS - Seguridad para Repartidores</p>
            </div>
            
            <div class="content">
              <h2>Hola ${user.nombre},</h2>
              
              <p>Has solicitado una nueva contraseña para tu cuenta de Rider SOS. Aquí tienes tu nueva contraseña:</p>
              
              <div class="password-box">
                <p><strong>Tu nueva contraseña es:</strong></p>
                <div class="password">${newPassword}</div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul>
                  <li>Guarda esta contraseña en un lugar seguro</li>
                  <li>Te recomendamos cambiarla después de iniciar sesión</li>
                  <li>No compartas esta información con nadie</li>
                </ul>
              </div>
              
              <p>Puedes iniciar sesión en la aplicación con tu email y esta nueva contraseña.</p>
              
              <p><strong>Datos de tu cuenta:</strong></p>
              <ul>
                <li><strong>Nombre:</strong> ${user.nombre}</li>
                <li><strong>Email:</strong> ${user.email}</li>
                <li><strong>Moto:</strong> ${user.moto}</li>
                <li><strong>Color:</strong> ${user.color}</li>
              </ul>
              
              <p>Si no solicitaste este cambio, por favor contacta con soporte inmediatamente.</p>
              
              <p>¡Gracias por usar Rider SOS y mantenerte seguro en la carretera!</p>
            </div>
            
            <div class="footer">
              <p>Rider SOS - Sistema de Seguridad para Repartidores</p>
              <p>Este es un email automático, por favor no respondas a este mensaje.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Generar texto del email de reset de contraseña
    generatePasswordResetEmailText(user, newPassword) {
      return `

  Rider SOS - Seguridad para Repartidores

  Hola ${user.nombre},

  Has solicitado una nueva contraseña para tu cuenta de Rider SOS.

  TU NUEVA CONTRASEÑA ES: ${newPassword}

  IMPORTANTE:
  - Guarda esta contraseña en un lugar seguro
  - Te recomendamos cambiarla después de iniciar sesión
  - No compartas esta información con nadie

  Datos de tu cuenta:
  - Nombre: ${user.nombre}
  - Email: ${user.email}
  - Moto: ${user.moto}
  - Color: ${user.color}

  Puedes iniciar sesión en la aplicación con tu email y esta nueva contraseña.

  Si no solicitaste este cambio, por favor contacta con soporte inmediatamente.

  ¡Gracias por usar Rider SOS y mantenerte seguro en la carretera!

  ---
  Rider SOS - Sistema de Seguridad para Repartidores
  Este es un email automático, por favor no respondas a este mensaje.
      `;
    }

    // Generar HTML del email de bienvenida
    generateWelcomeEmailHTML(user) {
      return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bienvenido a Rider SOS</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  line-height: 1.6;
                  color: #333;
                  max-width: 600px;
                  margin: 0 auto;
                  padding: 20px;
                  background-color: #f4f4f4;
              }
              .container {
                  background-color: #ffffff;
                  border-radius: 10px;
                  padding: 30px;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              }
              .header {
                  text-align: center;
                  background: linear-gradient(135deg, #e74c3c, #c0392b);
                  color: white;
                  padding: 30px;
                  border-radius: 10px;
                  margin-bottom: 30px;
              }
              .header h1 {
                  margin: 0;
                  font-size: 28px;
                  font-weight: bold;
              }
              .header p {
                  margin: 10px 0 0 0;
                  font-size: 16px;
                  opacity: 0.9;
              }
              .content {
                  margin-bottom: 30px;
              }
              .welcome-message {
                  background-color: #f8f9fa;
                  padding: 20px;
                  border-radius: 8px;
                  border-left: 4px solid #e74c3c;
                  margin-bottom: 20px;
              }
              .user-info {
                  background-color: #fff;
                  border: 1px solid #e1e8ed;
                  border-radius: 8px;
                  padding: 20px;
                  margin-bottom: 20px;
              }
              .info-row {
                  display: flex;
                  justify-content: space-between;
                  margin-bottom: 10px;
                  padding: 8px 0;
                  border-bottom: 1px solid #f0f0f0;
              }
              .info-row:last-child {
                  border-bottom: none;
                  margin-bottom: 0;
              }
              .info-label {
                  font-weight: bold;
                  color: #2c3e50;
              }
              .info-value {
                  color: #7f8c8d;
              }
              .features {
                  margin-top: 30px;
              }
              .feature-item {
                  display: flex;
                  align-items: center;
                  margin-bottom: 15px;
                  padding: 10px;
                  background-color: #f8f9fa;
                  border-radius: 6px;
              }
              .feature-icon {
                  font-size: 24px;
                  margin-right: 15px;
                  width: 40px;
                  text-align: center;
              }
              .feature-text {
                  flex: 1;
              }
              .feature-title {
                  font-weight: bold;
                  color: #2c3e50;
                  margin-bottom: 5px;
              }
              .feature-description {
                  color: #7f8c8d;
                  font-size: 14px;
              }
              .cta {
                  text-align: center;
                  margin-top: 30px;
                  padding: 20px;
                  background: linear-gradient(135deg, #e74c3c, #c0392b);
                  border-radius: 8px;
                  color: white;
              }
              .cta-button {
                  display: inline-block;
                  background-color: #ffffff;
                  color: #e74c3c;
                  padding: 12px 30px;
                  text-decoration: none;
                  border-radius: 25px;
                  font-weight: bold;
                  margin-top: 10px;
                  transition: all 0.3s ease;
              }
              .cta-button:hover {
                  background-color: #f8f9fa;
                  transform: translateY(-2px);
              }
              .footer {
                  text-align: center;
                  margin-top: 30px;
                  padding-top: 20px;
                  border-top: 1px solid #e1e8ed;
                  color: #7f8c8d;
                  font-size: 14px;
              }
              .social-links {
                  margin-top: 15px;
              }
              .social-links a {
                  color: #e74c3c;
                  text-decoration: none;
                  margin: 0 10px;
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🚀 Rider SOS</h1>
                  <p>Seguridad para Repartidores</p>
              </div>
              
              <div class="content">
                  <div class="welcome-message">
                      <h2>¡Hola ${user.nombre}!</h2>
                      <p>Te has registrado correctamente en <strong>Rider SOS</strong> con tu moto <strong>${user.moto}</strong> de color <strong>${user.color}</strong>.</p>
                      <p>Tu cuenta ha sido creada exitosamente y ya puedes comenzar a usar todas las funcionalidades de seguridad que ofrecemos.</p>
                  </div>
                  
                  <div class="user-info">
                      <h3>📋 Información de tu cuenta</h3>
                      <div class="info-row">
                          <span class="info-label">Nombre:</span>
                          <span class="info-value">${user.nombre}</span>
                      </div>
                      <div class="info-row">
                          <span class="info-label">Email:</span>
                          <span class="info-value">${user.email}</span>
                      </div>
                      <div class="info-row">
                          <span class="info-label">Moto:</span>
                          <span class="info-value">${user.moto}</span>
                      </div>
                      <div class="info-row">
                          <span class="info-label">Color:</span>
                          <span class="info-value">${user.color}</span>
                      </div>
                      <div class="info-row">
                          <span class="info-label">Fecha de registro:</span>
                          <span class="info-value">${new Date(user.created_at).toLocaleDateString('es-ES')}</span>
                      </div>
                  </div>
                  
                  <div class="features">
                      <h3>🛡️ Características de Rider SOS</h3>
                      
                      <div class="feature-item">
                          <div class="feature-icon">🚨</div>
                          <div class="feature-text">
                              <div class="feature-title">Alertas SOS Instantáneas</div>
                              <div class="feature-description">Activa alertas de emergencia con un solo toque</div>
                          </div>
                      </div>
                      
                      <div class="feature-item">
                          <div class="feature-icon">📍</div>
                          <div class="feature-text">
                              <div class="feature-title">Seguimiento en Tiempo Real</div>
                              <div class="feature-description">Comparte tu ubicación automáticamente cada 2 minutos</div>
                          </div>
                      </div>
                      
                      <div class="feature-item">
                          <div class="feature-icon">🔔</div>
                          <div class="feature-text">
                              <div class="feature-title">Notificaciones de Emergencia</div>
                              <div class="feature-description">Recibe y envía alertas a otros repartidores</div>
                          </div>
                      </div>
                      
                      <div class="feature-item">
                          <div class="feature-icon">👥</div>
                          <div class="feature-text">
                              <div class="feature-title">Comunidad de Repartidores</div>
                              <div class="feature-description">Conecta con otros riders para mayor seguridad</div>
                          </div>
                      </div>
                  </div>
                  
                  <div class="cta">
                      <h3>🎯 ¡Comienza a usar Rider SOS!</h3>
                      <p>Recuerda activar el seguimiento de ubicación desde la aplicación para mayor seguridad.</p>
                      <a href="#" class="cta-button">Abrir Aplicación</a>
                  </div>
              </div>
              
              <div class="footer">
                  <p>Rider SOS - Sistema de Seguridad para Repartidores</p>
                  <p>Este es un email automático, por favor no respondas a este mensaje.</p>
              </div>
          </div>
      </body>
      </html>
      `;
    }

    // Generar texto plano del email de bienvenida
    generateWelcomeEmailText(user) {
      return `
  🚀 RIDER SOS - Seguridad para Repartidores

  ¡Hola ${user.nombre}!

  Te has registrado correctamente en Rider SOS con tu moto ${user.moto} de color ${user.color}.

  INFORMACIÓN DE TU CUENTA:
  - Nombre: ${user.nombre}
  - Email: ${user.email}
  - Moto: ${user.moto}
  - Color: ${user.color}
  - Fecha de registro: ${new Date(user.created_at).toLocaleDateString('es-ES')}

  CARACTERÍSTICAS DE RIDER SOS:
  🚨 Alertas SOS Instantáneas - Activa alertas de emergencia con un solo toque
  📍 Seguimiento en Tiempo Real - Comparte tu ubicación automáticamente cada 2 minutos
  🔔 Notificaciones de Emergencia - Recibe y envía alertas a otros repartidores
  👥 Comunidad de Repartidores - Conecta con otros riders para mayor seguridad

  ¡IMPORTANTE!
  Recuerda activar el seguimiento de ubicación desde la aplicación para mayor seguridad.

  Gracias por confiar en Rider SOS para mantenerte seguro mientras trabajas.

  Rider SOS - Tu seguridad es nuestra prioridad

  ---
  Este email fue enviado automáticamente. Por favor no respondas a este mensaje.
      `;
    }

    // Generar HTML del email de reset con link
    generatePasswordResetLinkEmailHTML(user, resetLink) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cambiar Contraseña - Rider SOS</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 20px 0; }
            .button { display: inline-block; background: #e74c3c; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Cambiar Contraseña</h1>
              <p>Rider SOS - Seguridad para Repartidores</p>
            </div>
            
            <div class="content">
              <h2>Hola ${user.nombre},</h2>
              
              <p>Has solicitado cambiar la contraseña de tu cuenta de Rider SOS.</p>
              
              <p>Para continuar con el cambio de contraseña, haz clic en el siguiente botón:</p>
              
              <div style="text-align: center;">
                <a href="${resetLink}" class="button">Cambiar Contraseña</a>
              </div>
              
              <div class="warning">
                <strong>⚠️ Importante:</strong>
                <ul>
                  <li>Este link es válido por 1 hora</li>
                  <li>Si no solicitaste este cambio, ignora este email</li>
                  <li>No compartas este link con nadie</li>
                </ul>
              </div>
              
              <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
              <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">${resetLink}</p>
              
              <p>¡Gracias por usar Rider SOS y mantenerte seguro en la carretera!</p>
            </div>
            
            <div class="footer">
              <p>Rider SOS - Sistema de Seguridad para Repartidores</p>
              <p>Este es un email automático, por favor no respondas a este mensaje.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Generar texto del email de reset con link
    generatePasswordResetLinkEmailText(user, resetLink) {
      return `
  Cambiar Contraseña - Rider SOS
  Seguridad para Repartidores

  Hola ${user.nombre},

  Has solicitado cambiar la contraseña de tu cuenta de Rider SOS.

  Para continuar con el cambio de contraseña, visita el siguiente enlace:
  ${resetLink}

  IMPORTANTE:
  - Este link es válido por 1 hora
  - Si no solicitaste este cambio, ignora este email
  - No compartas este link con nadie

  ¡Gracias por usar Rider SOS y mantenerte seguro en la carretera!

  ---
  Rider SOS - Sistema de Seguridad para Repartidores
  Este es un email automático, por favor no respondas a este mensaje.
      `;
    }

    // Generar HTML del email de aprobación
    generateApprovalEmailHTML(user) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Cuenta Aprobada - Rider SOS</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 20px 0; }
            .success-box { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .button { display: inline-block; background: #27ae60; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ ¡Cuenta Aprobada!</h1>
              <p>Rider SOS - Seguridad para Repartidores</p>
            </div>
            
            <div class="content">
              <h2>¡Felicidades ${user.nombre}!</h2>
              
              <div class="success-box">
                <strong>🎉 Tu cuenta ha sido aprobada exitosamente</strong>
                <p>Ya puedes iniciar sesión en la aplicación y comenzar a usar todas las funcionalidades de Rider SOS.</p>
              </div>
              
              <p><strong>Datos de tu cuenta:</strong></p>
              <ul>
                <li><strong>Nombre:</strong> ${user.nombre}</li>
                <li><strong>Email:</strong> ${user.email}</li>
                <li><strong>Moto:</strong> ${user.moto}</li>
                <li><strong>Color:</strong> ${user.color}</li>
              </ul>
              
              <p>Ahora puedes:</p>
              <ul>
                <li>🚨 Activar alertas SOS de emergencia</li>
                <li>📍 Compartir tu ubicación en tiempo real</li>
                <li>🔔 Recibir notificaciones de otros repartidores</li>
                <li>👥 Conectarte con la comunidad de riders</li>
              </ul>
              
              <div style="text-align: center;">
                <a href="#" class="button">Iniciar Sesión</a>
              </div>
              
              <p>¡Bienvenido a la comunidad de Rider SOS y mantente seguro en la carretera!</p>
            </div>
            
            <div class="footer">
              <p>Rider SOS - Sistema de Seguridad para Repartidores</p>
              <p>Este es un email automático, por favor no respondas a este mensaje.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Generar texto del email de aprobación
    generateApprovalEmailText(user) {
      return `
  ¡Cuenta Aprobada! - Rider SOS
  Seguridad para Repartidores

  ¡Felicidades ${user.nombre}!

  🎉 Tu cuenta ha sido aprobada exitosamente
  Ya puedes iniciar sesión en la aplicación y comenzar a usar todas las funcionalidades de Rider SOS.

  DATOS DE TU CUENTA:
  - Nombre: ${user.nombre}
  - Email: ${user.email}
  - Moto: ${user.moto}
  - Color: ${user.color}

  AHORA PUEDES:
  🚨 Activar alertas SOS de emergencia
  📍 Compartir tu ubicación en tiempo real
  🔔 Recibir notificaciones de otros repartidores
  👥 Conectarte con la comunidad de riders

  ¡Bienvenido a la comunidad de Rider SOS y mantente seguro en la carretera!

  ---
  Rider SOS - Sistema de Seguridad para Repartidores
  Este es un email automático, por favor no respondas a este mensaje.
      `;
    }

    // Generar HTML del email de rechazo
    generateRejectionEmailHTML(user) {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Registro No Aprobado - Rider SOS</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #e74c3c, #c0392b); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 20px 0; }
            .info-box { background: #f8f9fa; border: 1px solid #e9ecef; color: #495057; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>❌ Registro No Aprobado</h1>
              <p>Rider SOS - Seguridad para Repartidores</p>
            </div>
            
            <div class="content">
              <h2>Hola ${user.nombre},</h2>
              
              <p>Lamentamos informarte que tu solicitud de registro en Rider SOS no ha sido aprobada en esta ocasión.</p>
              
              <div class="info-box">
                <strong>📋 Información de tu solicitud:</strong>
                <ul>
                  <li><strong>Nombre:</strong> ${user.nombre}</li>
                  <li><strong>Email:</strong> ${user.email}</li>
                  <li><strong>Moto:</strong> ${user.moto}</li>
                  <li><strong>Color:</strong> ${user.color}</li>
                  <li><strong>Fecha de solicitud:</strong> ${new Date(user.created_at).toLocaleDateString('es-ES')}</li>
                </ul>
              </div>
              
              <p>Si crees que esto es un error o tienes preguntas sobre tu solicitud, puedes contactar con nuestro equipo de soporte.</p>
              
              <p>Gracias por tu interés en Rider SOS.</p>
            </div>
            
            <div class="footer">
              <p>Rider SOS - Sistema de Seguridad para Repartidores</p>
              <p>Este es un email automático, por favor no respondas a este mensaje.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    

    // Generar texto del email de rechazo
    generateRejectionEmailText(user) {
      return `
  Registro No Aprobado - Rider SOS
  Seguridad para Repartidores

  Hola ${user.nombre},

  Lamentamos informarte que tu solicitud de registro en Rider SOS no ha sido aprobada en esta ocasión.

  INFORMACIÓN DE TU SOLICITUD:
  - Nombre: ${user.nombre}
  - Email: ${user.email}
  - Moto: ${user.moto}
  - Color: ${user.color}
  - Fecha de solicitud: ${new Date(user.created_at).toLocaleDateString('es-ES')}

  Si crees que esto es un error o tienes preguntas sobre tu solicitud, puedes contactar con nuestro equipo de soporte.

  Gracias por tu interés en Rider SOS.

  ---
  Rider SOS - Sistema de Seguridad para Repartidores
  Este es un email automático, por favor no respondas a este mensaje.
      `;
    }
  }

  module.exports = new EmailService();
