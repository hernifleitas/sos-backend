// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
let { Pool } = (() => { try { return require('pg'); } catch { return {}; } })();

class Database {
  constructor() {
    this.db = null; // SQLite handle
    this.pool = null; // PG pool
    this.usePg = !!(process.env.DATABASE_URL && Pool);
    this.init();
  }

  init() {
    if (this.usePg) {
      // Inicializar Postgres
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
      });
      // Crear tablas si no existen
      this.createTablesPg()
        .then(() => console.log('Conectado a PostgreSQL y tablas verificadas'))
        .catch((err) => console.error('Error creando tablas en PostgreSQL:', err.message));
      return;
    }

    // Fallback: SQLite local
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'users.db');
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error abriendo la base de datos:', err.message);
      } else {
        console.log('Conectado a la base de datos SQLite');
        this.createTablesSqlite();
      }
    });
  }

  // =================== CREACIÓN DE TABLAS ===================
  async createTablesPg() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          nombre TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          moto TEXT NOT NULL,
          color TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          is_active BOOLEAN DEFAULT TRUE,
          status TEXT DEFAULT 'pending',
          reset_token TEXT,
          reset_token_expires TIMESTAMP,
          role TEXT DEFAULT 'user'
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          room TEXT DEFAULT 'global',
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          deleted_at TIMESTAMP,
          deleted_by INTEGER
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS device_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          token TEXT UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      // Trigger para updated_at en device_tokens
      await client.query(`
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'device_tokens_set_updated_at'
          ) THEN
            CREATE TRIGGER device_tokens_set_updated_at
            BEFORE UPDATE ON device_tokens
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at();
          END IF;
        END $$;
      `);
    } finally {
      client.release();
    }
  }

  createTablesSqlite() {
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

  // =================== MÉTODOS USUARIOS ===================
  createUser(userData) {
    if (this.usePg) {
      return (async () => {
        const { nombre, email, password, moto, color } = userData;
        const sql = `
          INSERT INTO users (nombre, email, password, moto, color)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, nombre, email, moto, color, created_at
        `;
        const { rows } = await this.pool.query(sql, [nombre, email, password, moto, color]);
        return rows[0];
      })();
    }
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

  findUserByEmail(email) {
    if (this.usePg) {
      return (async () => {
        const sql = 'SELECT * FROM users WHERE email = $1 AND is_active = TRUE';
        const { rows } = await this.pool.query(sql, [email]);
        return rows[0];
      })();
    }
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

  findUserById(id) {
    if (this.usePg) {
      return (async () => {
        const sql = 'SELECT * FROM users WHERE id = $1 AND is_active = TRUE';
        const { rows } = await this.pool.query(sql, [id]);
        return rows[0];
      })();
    }
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

  updateUser(id, userData) {
    if (this.usePg) {
      return (async () => {
        const { nombre, moto, color } = userData;
        const sql = `
          UPDATE users
          SET nombre = $1, moto = $2, color = $3, updated_at = NOW()
          WHERE id = $4
        `;
        const result = await this.pool.query(sql, [nombre, moto, color, id]);
        return { changes: result.rowCount };
      })();
    }
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

  updateUserPassword(id, password) {
    if (this.usePg) {
      return (async () => {
        const sql = `
          UPDATE users
          SET password = $1, updated_at = NOW()
          WHERE id = $2
        `;
        const result = await this.pool.query(sql, [password, id]);
        return { changes: result.rowCount };
      })();
    }
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

  deactivateUser(id) {
    if (this.usePg) {
      return (async () => {
        const result = await this.pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
        return { changes: result.rowCount };
      })();
    }
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

  getAllUsers() {
    if (this.usePg) {
      return (async () => {
        const { rows } = await this.pool.query('SELECT id, nombre, email, moto, color, created_at FROM users WHERE is_active = TRUE');
        return rows;
      })();
    }
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

  getPendingUsers() {
    if (this.usePg) {
      return (async () => {
        const { rows } = await this.pool.query("SELECT id, nombre, email, moto, color, created_at FROM users WHERE status = 'pending' AND is_active = TRUE");
        return rows;
      })();
    }
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

  approveUser(id) {
    if (this.usePg) {
      return (async () => {
        const result = await this.pool.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', ['approved', id]);
        return { changes: result.rowCount };
      })();
    }
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

  rejectUser(id) {
    if (this.usePg) {
      return (async () => {
        const result = await this.pool.query('UPDATE users SET status = $1, is_active = FALSE, updated_at = NOW() WHERE id = $2', ['rejected', id]);
        return { changes: result.rowCount };
      })();
    }
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

  saveResetToken(email, token, expiresAt) {
    if (this.usePg) {
      return (async () => {
        const sql = 'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3';
        const result = await this.pool.query(sql, [token, expiresAt, email]);
        return { changes: result.rowCount };
      })();
    }
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

  findUserByResetToken(token) {
    if (this.usePg) {
      return (async () => {
        const sql = 'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND is_active = TRUE';
        const { rows } = await this.pool.query(sql, [token]);
        return rows[0];
      })();
    }
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

  clearResetToken(id) {
    if (this.usePg) {
      return (async () => {
        const sql = 'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1';
        const result = await this.pool.query(sql, [id]);
        return { changes: result.rowCount };
      })();
    }
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

  makeAdmin(id) {
    if (this.usePg) {
      return (async () => {
        const result = await this.pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', id]);
        return { changes: result.rowCount };
      })();
    }
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

  isAdmin(id) {
    if (this.usePg) {
      return (async () => {
        const { rows } = await this.pool.query('SELECT role FROM users WHERE id = $1 AND is_active = TRUE', [id]);
        return rows[0]?.role === 'admin';
      })();
    }
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

  // =================== CHAT ===================
  addMessage(userId, content, room = 'global') {
    if (this.usePg) {
      return (async () => {
        const sql = 'INSERT INTO messages (user_id, room, content) VALUES ($1, $2, $3) RETURNING id';
        const { rows } = await this.pool.query(sql, [userId, room, content]);
        return { id: rows[0].id };
      })();
    }
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

  getMessages({ room = 'global', before = null, limit = 50 }) {
    if (this.usePg) {
      return (async () => {
        const params = [room];
        let sql = `
          SELECT m.id, m.content, m.created_at, u.id AS user_id, u.nombre, u.moto, u.color
          FROM messages m
          JOIN users u ON u.id = m.user_id
          WHERE m.room = $1 AND m.deleted_at IS NULL
        `;
        if (before) {
          sql += ' AND m.created_at < $2';
          params.push(before);
        }
        sql += ' ORDER BY m.created_at DESC LIMIT ' + Number(limit);
        const { rows } = await this.pool.query(sql, params);
        return rows.reverse();
      })();
    }
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

  softDeleteMessage(messageId, adminUserId) {
    if (this.usePg) {
      return (async () => {
        const sql = `
          UPDATE messages
          SET deleted_at = NOW(), deleted_by = $1
          WHERE id = $2 AND deleted_at IS NULL
        `;
        const result = await this.pool.query(sql, [adminUserId, messageId]);
        return { changes: result.rowCount };
      })();
    }
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

  // =================== TOKENS ===================
  upsertDeviceToken(userId, token) {
    if (this.usePg) {
      return (async () => {
        const sql = `
          INSERT INTO device_tokens (user_id, token)
          VALUES ($1, $2)
          ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = NOW()
          RETURNING id
        `;
        const { rows } = await this.pool.query(sql, [userId, token]);
        return { id: rows[0]?.id || null, changes: rows[0] ? 1 : 0 };
      })();
    }
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

  getAllTokensExcept(userId) {
    if (this.usePg) {
      return (async () => {
        const { rows } = await this.pool.query('SELECT token FROM device_tokens WHERE user_id != $1', [userId]);
        return rows.map(r => r.token);
      })();
    }
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

  getAllTokens() {
    if (this.usePg) {
      return (async () => {
        const { rows } = await this.pool.query('SELECT token FROM device_tokens');
        return rows.map(r => r.token);
      })();
    }
    return new Promise((resolve, reject) => {
      const sql = `SELECT token FROM device_tokens`;
      this.db.all(sql, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows.map(r => r.token));
      });
    });
  }

  // =================== CIERRE ===================
  close() {
    if (this.usePg && this.pool) {
      this.pool.end().catch((e) => console.error('Error cerrando pool PG:', e));
      return;
    }
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
