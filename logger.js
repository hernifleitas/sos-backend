const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Función para obtener la ruta del archivo de log del día
const getLogFilePath = (type = 'app') => {
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  return path.join(logsDir, `${type}-${dateStr}.log`);
};

// Función para escribir en el log
const writeLog = (type, message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  const logFile = getLogFilePath(type);
  
  // Escribir en archivo
  fs.appendFile(logFile, logMessage, (err) => {
    if (err) console.error('Error writing to log file:', err);
  });
  
  // También mostrar en consola
  console.log(`[${type.toUpperCase()}] ${logMessage.trim()}`);
};

const logger = {
    info: (message) => writeToFile('logs.txt', `[INFO] ${message}`),
    error: (message) => writeToFile('logs.txt', `[ERROR] ${message}`),
    user: (userData) => {
      const userLog = `Nuevo usuario registrado: ${userData.email} - ${userData.nombre}`;
      writeToFile('users.txt', userLog);
    },
    approvedUser: (userData) => {
      const userLog = `USUARIO APROBADO:\n` +
        `ID: ${userData.id}\n` +
        `Nombre: ${userData.nombre}\n` +
        `Email: ${userData.email}\n` +
        `Moto: ${userData.moto || 'No especificada'}\n` +
        `Color: ${userData.color || 'No especificado'}\n` +
        `Teléfono: ${userData.telefono || 'No especificado'}\n` +
        `Rol: ${userData.role || 'user'}\n` +
        `Creado en: ${userData.created_at || new Date().toISOString()}\n` +
        `Estado: ${userData.status || 'active'}\n` +
        `----------------------------------------`;
      writeToFile('users.txt', userLog);
    },
    location: (riderId, data) => {
      const { lat, lng, tipo } = data;
      writeToFile('logs.txt', `[LOCATION] Rider ${riderId} - Lat: ${lat}, Lng: ${lng} (${tipo})`);
    }
  };

module.exports = logger;
