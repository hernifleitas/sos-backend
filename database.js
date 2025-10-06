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
        CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TIMESTAMP NOT NULL DEFAULT NOW(),
  end_date TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Asegúrate de que no haya duplicados activos
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_active_subscription 
ON premium_subscriptions(user_id) 
WHERE is_active = true;
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

      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          preference_id TEXT NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(3) NOT NULL,
          subscription_id INTEGER REFERENCES premium_subscriptions(id) ON DELETE SET NULL,
          status VARCHAR(20) DEFAULT 'pending',
          payment_method_id TEXT,
          payment_type_id TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(preference_id)
        );
      `);

      await client.query(`
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      // Crear triggers para updated_at
      const triggers = [
        { table: 'device_tokens', name: 'device_tokens_set_updated_at' },
        { table: 'payments', name: 'payments_set_updated_at' }
      ];

      for (const trigger of triggers) {
        await client.query(`
          DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.table};
          CREATE TRIGGER ${trigger.name}
          BEFORE UPDATE ON ${trigger.table}
          FOR EACH ROW
          EXECUTE FUNCTION set_updated_at();
        `);
      }

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
      const { rows } = await this.pool.query(`
        SELECT id, nombre, email, moto, color, created_at, status, role, premium_expires_at
        FROM users
        WHERE is_active = TRUE
      `);
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


  async makePremium(userId, months = 1) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Calcular fecha de expiración
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + months);

      // 1. Actualizar el usuario
      await client.query(`
        UPDATE users 
        SET 
          role = 'premium',
          is_premium = true,
          premium_expires_at = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [endDate, userId]);

      // 2. Desactivar suscripciones anteriores
      await client.query(`
        UPDATE premium_subscriptions 
        SET is_active = false, 
            updated_at = NOW() 
        WHERE user_id = $1
      `, [userId]);

      // 3. Crear nueva suscripción
      await client.query(`
        INSERT INTO premium_subscriptions 
          (user_id, start_date, end_date, is_active)
        VALUES 
          ($1, NOW(), $2, true)
      `, [userId, endDate]);

      await client.query('COMMIT');

      return {
        success: true,
        message: 'Usuario actualizado a premium exitosamente',
        expiresAt: endDate
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en makePremium:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async removePremium(userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verificar si el usuario es admin (no se puede quitar premium a un admin)
      const adminCheck = await client.query(
        'SELECT role FROM users WHERE id = $1 AND role = $2',
        [userId, 'admin']
      );

      if (adminCheck.rows.length > 0) {
        return { changes: 0, message: 'No se puede quitar premium a un administrador' };
      }

      // Quitar premium y limpiar fecha de expiración
      const result = await client.query(
        `UPDATE users 
         SET role = 'user', premium_expires_at = NULL, updated_at = NOW() 
         WHERE id = $1 AND role = 'premium'
         RETURNING id`,
        [userId]
      );

      // Desactivar suscripciones activas
      await client.query(
        `UPDATE premium_subscriptions 
         SET is_active = FALSE, updated_at = NOW() 
         WHERE user_id = $1 AND is_active = TRUE`,
        [userId]
      );

      await client.query('COMMIT');
      return {
        changes: result.rowCount,
        success: result.rowCount > 0,
        message: result.rowCount > 0 ? 'Premium eliminado correctamente' : 'Usuario no encontrado o no era premium'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en removePremium:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async isPremium(userId) {
    const client = await this.pool.connect();
    try {
      // Primero verificamos si el usuario es admin (siempre premium)
      const adminCheck = await client.query(
        'SELECT role FROM users WHERE id = $1 AND role = $2 AND is_active = TRUE',
        [userId, 'admin']
      );

      if (adminCheck.rows.length > 0) return true;

      // Verificar usuario premium con expiración
      const { rows } = await client.query(
        `SELECT role, premium_expires_at FROM users 
         WHERE id = $1 AND is_active = TRUE`,
        [userId]
      );

      if (rows.length === 0) return false;

      const user = rows[0];

      // Si no es premium, retornar falso
      if (user.role !== 'premium') return false;

      // Si no tiene fecha de expiración, asumir premium permanente
      if (!user.premium_expires_at) return true;

      // Verificar si la suscripción ha expirado
      const now = new Date();
      const expiresAt = new Date(user.premium_expires_at);

      if (now > expiresAt) {
        // Si expiró, actualizar el rol a 'user'
        await client.query(
          'UPDATE users SET role = $1, premium_expires_at = NULL, updated_at = NOW() WHERE id = $2',
          ['user', userId]
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error en isPremium:', error);
      return false;
    } finally {
      client.release();
    }
  }

  async activatePremiumSubscription(paymentId, paymentData) {
    console.log('activatePremiumSubscription:', { paymentId, type: typeof paymentId });
    if (!paymentId || isNaN(parseInt(paymentId, 10))) {
      throw new Error(`paymentId inválido: ${paymentId}`);
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const paymentResult = await client.query(
        `SELECT * FROM payments 
         WHERE id = $1 
         AND status = 'pending'`,
        [parseInt(paymentId, 10)]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error('Pago no encontrado o ya procesado');
      }

      const payment = paymentResult.rows[0];
      const userId = payment.user_id;


      // 2. Calcular fechas de inicio y fin
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 mes de suscripción

      // 3. Crear la suscripción premium
      const subscriptionResult = await client.query(
        `INSERT INTO premium_subscriptions 
         (user_id, start_date, end_date, is_active, payment_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, end_date`,
        [userId, startDate, endDate, true, paymentId]
      );

      // 4. Actualizar el estado del pago
      await client.query(
        `UPDATE payments 
        SET status = 'completed', 
            payment_method_id = $1,
            payment_type_id = $2,
            updated_at = NOW()
        WHERE id = $3`,
        [paymentData.payment_method_id, paymentData.payment_type_id, parseInt(paymentId, 10)]
      );

      // 5. Actualizar el estado premium del usuario
      await client.query(
        `UPDATE users 
         SET is_premium = true, 
             premium_expires_at = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [endDate, userId]
      );

      await client.query('COMMIT');
      return {
        success: true,
        endDate: endDate.toISOString()
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en activatePremiumSubscription:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserSubscriptions(userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT ps.*, p.amount, p.currency, p.status as payment_status, p.created_at as payment_date
         FROM premium_subscriptions ps
         LEFT JOIN payments p ON p.id = ps.payment_id
         WHERE ps.user_id = $1
         ORDER BY ps.start_date DESC`,
        [userId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error en getUserSubscriptions:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async savePaymentDetails(paymentData) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { user_id, preference_id, amount, currency, subscription_id, payment_id } = paymentData;

      const result = await client.query(
        `INSERT INTO payments (
          user_id, 
          preference_id, 
          amount, 
          currency, 
          subscription_id,
          status,
          payment_id,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), NOW())
        RETURNING id`,
        [user_id, preference_id, amount, currency, subscription_id, payment_id]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en savePaymentDetails:', error);
      throw error;
    } finally {
      client.release();
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
