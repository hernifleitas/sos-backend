// database.js - Implementación SOLO PostgreSQL
const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = null;
    this.init();
  }

  init() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('DATABASE_URL no está definida. Configura la URL de PostgreSQL en variables de entorno.');
      process.exit(1);
    }

    this.pool = new Pool({
      connectionString,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
    });

    this.createTablesPg()
      .then(() => console.log('Conectado a PostgreSQL y tablas verificadas'))
      .catch((err) => console.error('Error creando tablas en PostgreSQL:', err.message));
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

  // =================== MÉTODOS USUARIOS ===================
  createUser(userData) {
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

  findUserByEmail(email) {
    return (async () => {
      const sql = 'SELECT * FROM users WHERE email = $1 AND is_active = TRUE';
      const { rows } = await this.pool.query(sql, [email]);
      return rows[0];
    })();
  }

  findUserById(id) {
    return (async () => {
      const sql = 'SELECT * FROM users WHERE id = $1 AND is_active = TRUE';
      const { rows } = await this.pool.query(sql, [id]);
      return rows[0];
    })();
  }

  updateUser(id, userData) {
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

  updateUserPassword(id, password) {
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

  deactivateUser(id) {
    return (async () => {
      const result = await this.pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [id]);
      return { changes: result.rowCount };
    })();
  }

  getAllUsers() {
    return (async () => {
      const { rows } = await this.pool.query('SELECT id, nombre, email, moto, color, created_at FROM users WHERE is_active = TRUE');
      return rows;
    })();
  }

  getPendingUsers() {
    return (async () => {
      const { rows } = await this.pool.query("SELECT id, nombre, email, moto, color, created_at FROM users WHERE status = 'pending' AND is_active = TRUE");
      return rows;
    })();
  }

  approveUser(id) {
    return (async () => {
      const result = await this.pool.query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', ['approved', id]);
      return { changes: result.rowCount };
    })();
  }

  rejectUser(id) {
    return (async () => {
      const result = await this.pool.query('UPDATE users SET status = $1, is_active = FALSE, updated_at = NOW() WHERE id = $2', ['rejected', id]);
      return { changes: result.rowCount };
    })();
  }

  saveResetToken(email, token, expiresAt) {
    return (async () => {
      const sql = 'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3';
      const result = await this.pool.query(sql, [token, expiresAt, email]);
      return { changes: result.rowCount };
    })();
  }

  findUserByResetToken(token) {
    return (async () => {
      const sql = 'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND is_active = TRUE';
      const { rows } = await this.pool.query(sql, [token]);
      return rows[0];
    })();
  }

  clearResetToken(id) {
    return (async () => {
      const sql = 'UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = $1';
      const result = await this.pool.query(sql, [id]);
      return { changes: result.rowCount };
    })();
  }

  makeAdmin(id) {
    return (async () => {
      const result = await this.pool.query('UPDATE users SET role = $1 WHERE id = $2', ['admin', id]);
      return { changes: result.rowCount };
    })();
  }

  isAdmin(id) {
    return (async () => {
      const { rows } = await this.pool.query('SELECT role FROM users WHERE id = $1 AND is_active = TRUE', [id]);
      return rows[0]?.role === 'admin';
    })();
  }

  // =================== CHAT ===================
  addMessage(userId, content, room = 'global') {
    return (async () => {
      const sql = 'INSERT INTO messages (user_id, room, content) VALUES ($1, $2, $3) RETURNING id';
      const { rows } = await this.pool.query(sql, [userId, room, content]);
      return { id: rows[0].id };
    })();
  }

  getMessages({ room = 'global', before = null, limit = 50 }) {
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

  softDeleteMessage(messageId, adminUserId) {
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

  // =================== TOKENS ===================
  upsertDeviceToken(userId, token) {
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

  getAllTokensExcept(userId) {
    return (async () => {
      const { rows } = await this.pool.query('SELECT token FROM device_tokens WHERE user_id != $1', [userId]);
      return rows.map(r => r.token);
    })();
  }

  getAllTokens() {
    return (async () => {
      const { rows } = await this.pool.query('SELECT token FROM device_tokens');
      return rows.map(r => r.token);
    })();
  }

  // =================== CIERRE ===================
  close() {
    if (this.pool) {
      this.pool.end().catch((e) => console.error('Error cerrando pool PG:', e));
    }
  }
}

module.exports = new Database();
