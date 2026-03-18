const twilio = require('twilio');

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

  async sendEmergencyMessage(contactPhone, userName, alertType, userLocation, userMoto) {
    if (!this.isEnabled) {
      console.log('WhatsApp no está configurado - Simulación');
      return this.simulateMessage(contactPhone, userName, alertType, userLocation, userMoto);
    }

    try {
      const formattedPhone = this.formatPhone(contactPhone);

      const templateSid = this.templates[alertType];
      if (!templateSid) throw new Error('Tipo de alerta inválido');

      const googleMapsUrl = `https://maps.google.com/?q=${userLocation.lat},${userLocation.lng}`;

      const response = await this.client.messages.create({
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${formattedPhone}`,
        contentSid: templateSid,
        contentVariables: JSON.stringify({
          "1": userName,
          "2": userMoto,
          "3": googleMapsUrl,
          "4": new Date().toLocaleString('es-AR')
        })
      });

      console.log(`✅ Enviado a ${formattedPhone}:`, response.sid);

      return {
        success: true,
        messageId: response.sid,
        phone: formattedPhone
      };

    } catch (error) {
      console.error(`❌ Error con ${contactPhone}:`, error.message);
      return {
        success: false,
        error: error.message,
        phone: contactPhone
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

  // 🔥 MÁXIMO 3 CONTACTOS
  async sendToMultipleContacts(contacts, userName, alertType, userLocation, userMoto) {
    const results = [];

    const limitedContacts = contacts.slice(0, 3);

    for (const contact of limitedContacts) {
      if (!contact.telefono) continue;

      const result = await this.sendEmergencyMessage(
        contact.telefono,
        userName,
        alertType,
        userLocation,
        userMoto
      );

      results.push({
        contactId: contact.id,
        contactName: contact.nombre,
        ...result
      });
    }

    return results;
  }
}

module.exports = new WhatsAppService();