const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔹 Configuración del BOT de Telegram
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Endpoint para recibir SOS
app.post("/sos", async (req, res) => {
  try {
    const { nombre, moto, color, ubicacion, fechaHora, tipo } = req.body;

    console.log("Datos recibidos:", req.body);

    if (!nombre || !moto || !color || !ubicacion || !ubicacion.lat || !ubicacion.lng || !tipo) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Elegir emoji y título según tipo de SOS
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
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: mensaje,
        parse_mode: "Markdown",
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error enviando SOS:", err);
    res.status(500).json({ error: "No se pudo enviar el SOS" });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en https://rider-9wjb3wbj3-hernifleitas-projects.vercel.app:${PORT}`);
});
