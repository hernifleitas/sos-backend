const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Función para obtener la ruta del archivo de log
const getLogFilePath = (type = 'app') => {
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  return path.join(logsDir, `${type}-${dateStr}.log`);
};

// Función para escribir en archivos de log
const writeToFile = (filename, message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  const logPath = path.join(logsDir, filename);
  
  try {
    fs.appendFileSync(logPath, logMessage);
    console.log(logMessage.trim()); // También mostrar en consola
  } catch (err) {
    console.error('Error escribiendo en el archivo de log:', err);
  }
};

// Función para escribir en el log con formato
const writeLog = (type, message) => {
  const logMessage = `[${type.toUpperCase()}] ${message}`;
  writeToFile(`${type}.log`, logMessage);
};

const logger = {
  info: (message) => writeLog('app', `[INFO] ${message}`),
  error: (message) => writeLog('app', `[ERROR] ${message}`),
  user: (userData) => {
    const userLog = `Nuevo usuario registrado: ${userData.email} - ${userData.nombre}`;
    writeToFile('users.log', userLog);
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
    writeToFile('users.log', userLog);
  },
  location: (riderId, data) => {
    const { lat, lng, tipo } = data;
    writeLog('location', `Rider ${riderId} - Lat: ${lat}, Lng: ${lng} (${tipo})`);
  }
};

module.exports = logger;