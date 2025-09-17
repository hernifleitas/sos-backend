// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'users.db');
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error abriendo la base de datos:', err.message);
      } else {
        console.log('Conectado a la base de datos SQLite');
        this.createTables();
      }
    });
  }

  createTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        moto TEXT NOT NULL,
        color TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1,
        status TEXT DEFAULT 'pending',
        reset_token TEXT,
        reset_token_expires DATETIME,
        role TEXT DEFAULT 'user'
      )
    `;

    this.db.run(createUsersTable, (err) => {
      if (err) {
        console.error('Error creando tabla users:', err.message);
      } else {
        console.log('Tabla users creada/verificada correctamente');
      }
    });

    const createMessagesTable = `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        room TEXT DEFAULT 'global',
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        deleted_by INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `;

    this.db.run(createMessagesTable, (err) => {
      if (err) {
        console.error('Error creando tabla messages:', err.message);
      } else {
        console.log('Tabla messages creada/verificada correctamente');
      }
    });

    const createDeviceTokens = `
      CREATE TABLE IF NOT EXISTS device_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `;

    this.db.run(createDeviceTokens, (err) => {
      if (err) {
        console.error('Error creando tabla device_tokens:', err.message);
      } else {
        console.log('Tabla device_tokens creada/verificada correctamente');
      }
    });
  }

  // Crear usuario
  createUser(userData) {
    return new Promise((resolve, reject) => {
      const { nombre, email, password, moto, color } = userData;
      
      const sql = `
        INSERT INTO users (nombre, email, password, moto, color)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [nombre, email, password, moto, color], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            nombre,
            email,
            moto,
            color,
            created_at: new Date().toISOString()
          });
        }
      });
    });
  }

  // Buscar usuario por email
  findUserByEmail(email) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM users WHERE email = ? AND is_active = 1';
      
      this.db.get(sql, [email], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Buscar usuario por ID
  findUserById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM users WHERE id = ? AND is_active = 1';
      
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Actualizar usuario
  updateUser(id, userData) {
    return new Promise((resolve, reject) => {
      const { nombre, moto, color } = userData;
      
      const sql = `
        UPDATE users 
        SET nombre = ?, moto = ?, color = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      this.db.run(sql, [nombre, moto, color, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Actualizar contraseña de usuario
  updateUserPassword(id, password) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE users 
        SET password = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      this.db.run(sql, [password, id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Desactivar usuario
  deactivateUser(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET is_active = 0 WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Obtener todos los usuarios activos
  getAllUsers() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT id, nombre, email, moto, color, created_at FROM users WHERE is_active = 1';
      
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Obtener usuarios pendientes de aprobación
  getPendingUsers() {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT id, nombre, email, moto, color, created_at FROM users WHERE status = "pending" AND is_active = 1';
      
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Aprobar usuario
  approveUser(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET status = "approved", updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Rechazar usuario
  rejectUser(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET status = "rejected", is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Guardar token de reset
  saveResetToken(email, token, expiresAt) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?';
      
      this.db.run(sql, [token, expiresAt, email], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Buscar usuario por token de reset
  findUserByResetToken(token) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > CURRENT_TIMESTAMP AND is_active = 1';
      
      this.db.get(sql, [token], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Limpiar token de reset
  clearResetToken(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Hacer usuario administrador
  makeAdmin(id) {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET role = "admin" WHERE id = ?';
      
      this.db.run(sql, [id], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Verificar si usuario es administrador
  isAdmin(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT role FROM users WHERE id = ? AND is_active = 1';
      
      this.db.get(sql, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.role === 'admin');
        }
      });
    });
  }

  // CHAT: Agregar mensaje
  addMessage(userId, content, room = 'global') {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO messages (user_id, room, content)
        VALUES (?, ?, ?)
      `;
      this.db.run(sql, [userId, room, content], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      });
    });
  }

  // CHAT: Obtener historial de mensajes (incluye datos públicos del usuario)
  getMessages({ room = 'global', before = null, limit = 50 }) {
    return new Promise((resolve, reject) => {
      const params = [room];
      let sql = `
        SELECT m.id, m.content, m.created_at, u.id AS user_id, u.nombre, u.moto, u.color
        FROM messages m
        JOIN users u ON u.id = m.user_id
        WHERE m.room = ? AND m.deleted_at IS NULL
      `;
      if (before) {
        sql += ' AND datetime(m.created_at) < datetime(?)';
        params.push(before);
      }
      sql += ' ORDER BY datetime(m.created_at) DESC LIMIT ?';
      params.push(limit);

      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        // Devolver en orden cronológico ascendente
        resolve(rows.reverse());
      });
    });
  }

  // CHAT: Borrar (soft delete) mensaje
  softDeleteMessage(messageId, adminUserId) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE messages
        SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?
        WHERE id = ? AND deleted_at IS NULL
      `;
      this.db.run(sql, [adminUserId, messageId], function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  // TOKENS: Registrar o actualizar token de notificación
  upsertDeviceToken(userId, token) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO device_tokens (user_id, token)
        VALUES (?, ?)
        ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, updated_at = CURRENT_TIMESTAMP
      `;
      this.db.run(sql, [userId, token], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  // TOKENS: Obtener tokens de todos menos el emisor
  getAllTokensExcept(userId) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT token FROM device_tokens WHERE user_id != ?
      `;
      this.db.all(sql, [userId], (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(r => r.token));
      });
    });
  }

  // TOKENS: Obtener todos los tokens
  getAllTokens() {
    return new Promise((resolve, reject) => {
      const sql = `SELECT token FROM device_tokens`;
      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(r => r.token));
      });
    });
  }

  // Cerrar conexión
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error cerrando la base de datos:', err.message);
        } else {
          console.log('Conexión a la base de datos cerrada');
        }
      });
    }
  }
}

module.exports = new Database();
