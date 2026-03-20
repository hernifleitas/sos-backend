const twilio = require('twilio');
const database = require('../database');

class WhatsAppService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    // ✅ Templates
    this.templates = {
      robo: 'HXb9d8169ceccb9ebe5bdf25efb6dbae33',
      accidente: 'HXd92979286e7b9f46a3a78882428f3bff'
    };

    if (this.accountSid && this.authToken && this.whatsappNumber) {
      this.client = twilio(this.accountSid, this.authToken);
      this.isEnabled = true;
      console.log('✅ Servicio WhatsApp habilitado');
    } else {
      this.isEnabled = false;
      console.log('⚠️ Servicio WhatsApp deshabilitado - Faltan variables de entorno');
    }
  }

  // 🔥 NORMALIZAR NÚMERO ARGENTINO
  formatPhone(phone) {
    if (!phone) return null;

    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('549')) return `+${cleaned}`;
    if (cleaned.startsWith('9')) return `+54${cleaned}`;

    return `+549${cleaned}`;
  }

  async sendEmergencyMessage(emergencyContacts, userName, alertType, userLocation, userMoto) {
    if (!this.isEnabled) {
      console.log('WhatsApp no está configurado - Simulación');
      return this.simulateMessage(emergencyContacts, userName, alertType, userLocation, userMoto);
    }

    try {
      // Obtener información del usuario para determinar límite
      const userResult = await database.pool.query(
        'SELECT role FROM users WHERE nombre = $1 LIMIT 1',
        [userName]
      );
      const user = userResult.rows[0];

      // Determinar límite según rol
      const maxContacts = user && user.role === 'premium' ? 3 : 1;

      // Limitar contactos según el plan
      const limitedContacts = Array.isArray(emergencyContacts)
        ? emergencyContacts.slice(0, maxContacts)
        : [];

      if (limitedContacts.length === 0) {
        console.log('No hay contactos de emergencia para notificar');
        return { success: true, sent: 0 };
      }

      console.log(`Enviando WhatsApp a ${limitedContacts.length} contactos de emergencia...`);

      const whatsappResults = await Promise.all(
        limitedContacts.map(async (contact) => {
          const formattedPhone = this.formatPhone(contact.telefono);

          const templateSid = this.templates[alertType];
          if (!templateSid) throw new Error('Tipo de alerta inválido');

          const googleMapsUrl = `https://maps.google.com/?q=${userLocation.lat},${userLocation.lng}`;

          const response = await this.client.messages.create({
            from: 'whatsapp:+5491136566333',
            to: `whatsapp:${formattedPhone}`,
            contentSid: templateSid,
            contentVariables: JSON.stringify({
              "1": userName,
              "2": userMoto,
              "3": googleMapsUrl,
              "4": new Date().toLocaleString('es-AR')
            })
          });

          console.log(`✅ Enviado a ${formattedPhone}: ${this.whatsappNumber}`, response.sid);

          return {
            success: true,
            messageId: response.sid,
            phone: formattedPhone
          };
        })
      );

      return whatsappResults;
    } catch (error) {
      console.error(`❌ Error al enviar mensajes de emergencia:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 🔥 SOLO PARA DEV (opcional dejarlo)
  formatEmergencyMessage(userName, alertType, location, moto) {
    const alertEmoji = alertType === 'robo' ? '🚨' : '🚑';
    const alertText = alertType === 'robo' ? 'ROBO' : 'ACCIDENTE';

    const googleMapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;

    return `${alertEmoji} ALERTA DE EMERGENCIA - ${alertText}\n\n` +
      `👤 Nombre: ${userName}\n` +
      `🏍️ Moto: ${moto}\n` +
      `📍 Ubicación: ${googleMapsUrl}\n` +
      `⏰ Hora: ${new Date().toLocaleString('es-AR')}\n\n` +
      `🆘 Contactar urgente.`;
  }

  simulateMessage(contactPhone, userName, alertType, userLocation, userMoto) {
    const message = this.formatEmergencyMessage(userName, alertType, userLocation, userMoto);

    console.log(`📱 SIMULACIÓN a ${contactPhone}`);
    console.log(message);

    return {
      success: true,
      simulated: true,
      phone: contactPhone,
      message
    };
  }
}

module.exports = new WhatsAppService();