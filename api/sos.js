import axios from "axios";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { nombre, moto, color, ubicacion, fechaHora, tipo } = req.body;

    // Validar que todos los datos existan
    if (!nombre || !moto || !color || !ubicacion || !ubicacion.lat || !ubicacion.lng || !tipo) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Definir título y emoji según tipo de SOS
    let titulo = "";
    let emoji = "";
    if (tipo === "robo") {
      titulo = "SOS Robo activado";
      emoji = "🚨";
    } else if (tipo === "pinchazo") {
      titulo = "SOS Pinchazo activado";
      emoji = "⚠️";
    } else {
      titulo = "SOS activado";
      emoji = "❗";
    }

    // Crear mensaje para Telegram
    const mensaje = `
${emoji} *${titulo}* ${emoji}
🧑 Usuario: ${nombre}
🏍️ Moto: ${moto}
🎨 Color: ${color}
📍 Ubicación: https://maps.google.com/?q=${ubicacion.lat},${ubicacion.lng}
🕒 Fecha y hora: ${fechaHora}
Tipo de alerta: ${tipo}
    `;

    // Enviar mensaje al grupo de Telegram
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
      parse_mode: "Markdown",
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error enviando SOS:", err);
    res.status(500).json({ error: "No se pudo enviar el SOS" });
  }
}
