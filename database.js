// database.js - Implementación SOLO PostgreSQL
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

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
          telefono TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          is_active BOOLEAN DEFAULT TRUE,
          status TEXT DEFAULT 'pending',
          reset_token TEXT,
          reset_token_expires TIMESTAMP,
          role TEXT DEFAULT 'user',
          premium_expires_at TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS premium_subscriptions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          mercadopago_payment_id VARCHAR(255) UNIQUE,
          amount DECIMAL(10,2) NOT NULL DEFAULT 5000.00,
          currency VARCHAR(3) DEFAULT 'ARS',
          status VARCHAR(50) DEFAULT 'pending',
          payment_method VARCHAR(100),
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          is_active BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
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
      const { nombre, email, password, moto, color, telefono } = userData;
      const sql = `
        INSERT INTO users (nombre, email, password, moto, color,telefono)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, nombre, email, moto, color, telefono, created_at
      `;
      const { rows } = await this.pool.query(sql, [nombre, email, password, moto, color, telefono]);
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

  getPendingUsers() {
    return (async () => {
      const { rows } = await this.pool.query("SELECT id, nombre, email, moto, color, telefono, created_at FROM users WHERE status = 'pending' AND is_active = TRUE");
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

  isAdmin(userId) {
    return (async () => {
      const { rows } = await this.pool.query(
        'SELECT role FROM users WHERE id = $1 AND is_active = TRUE',
        [userId]
      );
      return rows.length > 0 && rows[0].role === 'admin';
    })();
  }

  async createPremiumSubscription(userId, mercadopagoData) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      INSERT INTO premium_subscriptions (
        user_id,
        mercadopago_payment_id,
        mercadopago_preference_id,
        amount,
        currency,
        status,
        is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,FALSE)
      RETURNING *
    `, [
      parseInt(userId, 10),
      String(mercadopagoData.payment_id || ''),
      String(mercadopagoData.preference_id || ''),
      mercadopagoData.amount || 5000.00,
      mercadopagoData.currency || 'ARS',
      'pending'
    ]);

    await client.query('COMMIT');
    return { success: true, subscription: rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando suscripcion premium:', error);
    throw error;
  } finally {
    client.release();
  }
}

// DATABASE.JS - solo la función que cambia
async activatePremiumSubscription(userIdOrPaymentId, paymentData) {
  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');

    let subscription = null;
    let userId = null;

    // Convertir todo a string
    const searchPaymentId = paymentData.mercadopago_payment_id
      ? String(paymentData.mercadopago_payment_id)
      : null;

    // 1️⃣ Buscar suscripción pendiente por userId
    const existingResult = await client.query(
      `SELECT * FROM premium_subscriptions 
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [userIdOrPaymentId]
    );

    if (existingResult.rows.length > 0) {
      // Actualizar la suscripción pendiente con datos reales
      subscription = existingResult.rows[0];
      userId = subscription.user_id;

      await client.query(`
        UPDATE premium_subscriptions
        SET mercadopago_payment_id = $1,
            mercadopago_preference_id = $2,
            payment_method = $3,
            amount = $4,
            currency = $5,
            status = $6,
            start_date = NOW(),
            end_date = NOW() + interval '30 days',
            is_active = TRUE,
            updated_at = NOW()
        WHERE id = $7
      `, [
        searchPaymentId || `TMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        paymentData.mercadopago_preference_id ? String(paymentData.mercadopago_preference_id) : null,
        paymentData.payment_method || 'manual',
        paymentData.amount || 5000,
        paymentData.currency || 'ARS',
        paymentData.status || 'approved',
        subscription.id
      ]);

    } else {
      // No hay pendiente → crear nueva suscripción
      userId = userIdOrPaymentId;

      const newPaymentId = searchPaymentId || `TMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const insertResult = await client.query(`
        INSERT INTO premium_subscriptions (
          user_id,
          mercadopago_payment_id,
          mercadopago_preference_id,
          amount,
          currency,
          status,
          payment_method,
          start_date,
          end_date,
          is_active,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW() + interval '30 days',TRUE,NOW(),NOW())
        RETURNING *
      `, [
        userId,
        newPaymentId,
        paymentData.mercadopago_preference_id ? String(paymentData.mercadopago_preference_id) : null,
        paymentData.amount || 5000,
        paymentData.currency || 'ARS',
        paymentData.status || 'approved',
        paymentData.payment_method || 'manual'
      ]);

      subscription = insertResult.rows[0];
    }

    // Actualizar rol del usuario
    const endDate = subscription.end_date || new Date(Date.now() + 30*24*60*60*1000);
    await client.query(`
      UPDATE users
      SET role = 'premium',
          premium_expires_at = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [endDate, userId]);

    await client.query('COMMIT');
    return { success: true, endDate, userId };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error activando suscripcion premium:', error);
    throw error;
  } finally {
    client.release();
  }
}



  
  async isPremiumActive(userId) { 
    try {
      // Verificar si es admin
      const adminCheck = await this.pool.query(
        'SELECT role FROM users WHERE id = $1 AND role = $2 AND is_active = TRUE',
        [userId, 'admin']
      );
      if (adminCheck.rows.length > 0) return {isPremium:true, type: 'admin'};
  
      // Verificar suscripción activa
      const {rows} = await this.pool.query(`
        SELECT ps.*, u.role, u.premium_expires_at
        FROM premium_subscriptions ps
        JOIN users u ON ps.user_id = u.id
        WHERE ps.user_id = $1
          AND ps.is_active = TRUE
          AND ps.status = 'approved'
          AND ps.end_date > NOW()
        ORDER BY ps.end_date DESC
        LIMIT 1
      `, [userId]);
  
      if(rows.length > 0){
        return {
          isPremium:true,
          type: 'premium',
          expiresAt: rows[0].end_date,
          subscription: rows[0]
        };
      }
      return {isPremium:false, type: 'user'};
  
    } catch (error) {
      console.error('Error verificando premium:', error);
      return {isPremium:false, type: 'user', error: error.message};
    }
  }
    
  //obtener historial de suscripciones de un usuario 

  async getUserSubscriptions(userId){
    try {
      const {rows} = await this.pool.query (`
        SELECT * FROM premium_subscriptions
        WHERE user_id =$1
        ORDER BY created_at DESC`, [userId]);
        return rows;
    }catch(error){
      console.error('Error obteniendo suscripciones', error);
      throw error;
    }
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
