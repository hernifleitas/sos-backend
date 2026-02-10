const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    
    if (this.accountSid && this.authToken && this.whatsappNumber) {
      this.client = twilio(this.accountSid, this.authToken);
      this.isEnabled = true;
      console.log('✅ Servicio WhatsApp habilitado');
    } else {
      this.isEnabled = false;
      console.log('⚠️ Servicio WhatsApp deshabilitado - Faltan variables de entorno');
    }
  }

  async sendEmergencyMessage(contactPhone, userName, alertType, userLocation, userMoto) {
    if (!this.isEnabled) {
      console.log('WhatsApp no está configurado - Simulando envío');
      return this.simulateMessage(contactPhone, userName, alertType, userLocation, userMoto);
    }

    try {
      const message = this.formatEmergencyMessage(userName, alertType, userLocation, userMoto);
      
      const response = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${contactPhone}`
      });

      console.log(`✅ Mensaje WhatsApp enviado a ${contactPhone}:`, response.sid);
      return {
        success: true,
        messageId: response.sid,
        phone: contactPhone
      };
    } catch (error) {
      console.error(`❌ Error enviando WhatsApp a ${contactPhone}:`, error.message);
      return {
        success: false,
        error: error.message,
        phone: contactPhone
      };
    }
  }

  formatEmergencyMessage(userName, alertType, location, moto) {
    const alertEmoji = alertType === 'robo' ? '🚨' : '🚑';
    const alertText = alertType === 'robo' ? 'ROBO' : 'ACCIDENTE';
    
    const googleMapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
    
    return `${alertEmoji} ALERTA DE EMERGENCIA - ${alertText}\n\n` +
           `👤 Nombre: ${userName}\n` +
           `🏍️ Moto: ${moto}\n` +
           `📍 Ubicación: ${googleMapsUrl}\n` +
           `⏰ Hora: ${new Date().toLocaleString('es-ES')}\n\n` +
           `🆘 Por favor, contactar inmediatamente para verificar su estado.`;
  }

  simulateMessage(contactPhone, userName, alertType, userLocation, userMoto) {
    const message = this.formatEmergencyMessage(userName, alertType, userLocation, userMoto);
    console.log(`📱 SIMULACIÓN - Mensaje WhatsApp a ${contactPhone}:`);
    console.log(message);
    
    return {
      success: true,
      simulated: true,
      phone: contactPhone,
      message
    };
  }

  async sendToMultipleContacts(contacts, userName, alertType, userLocation, userMoto) {
    const results = [];
    
    for (const contact of contacts) {
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
