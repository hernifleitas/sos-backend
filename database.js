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
  mercadopago_payment_id VARCHAR(255) REFERENCES payments(mercadopago_payment_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

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
          mercadopago_payment_id VARCHAR(255) UNIQUE,
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
        { table: 'payments', name: 'payments_set_updated_at' },
        { table: 'premium_subscriptions', name: 'premium_subscriptions_set_updated_at' }
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
 // GOMERIA-MOVIL.

       await client.query(`
      -- Tabla de alertas de pinchazo
      CREATE TABLE IF NOT EXISTS pinchazo_alerts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        gomero_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' 
          CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled')),
        location_lat DECIMAL(10, 8) NOT NULL,
        location_lng DECIMAL(11, 8) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        canceled_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        notes TEXT
      );
      
      -- Historial de cambios de estado
      CREATE TABLE IF NOT EXISTS pinchazo_alert_history (
        id SERIAL PRIMARY KEY,
        alert_id INTEGER NOT NULL REFERENCES pinchazo_alerts(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
// Crear índices
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pinchazo_alerts_status ON pinchazo_alerts(status);
      CREATE INDEX IF NOT EXISTS idx_pinchazo_alerts_user ON pinchazo_alerts(user_id);
      CREATE INDEX IF NOT EXISTS idx_pinchazo_alerts_gomero ON pinchazo_alerts(gomero_id);
      CREATE INDEX IF NOT EXISTS idx_pinchazo_alerts_created ON pinchazo_alerts(created_at);
    `);
    // Verificar y agregar la columna 'role' si no existe
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'users' AND column_name = 'role') THEN
          ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
          
          -- Actualizar roles existentes según la lógica actual
          UPDATE users SET role = 'premium' 
          WHERE id IN (SELECT user_id FROM premium_subscriptions WHERE is_active = true);
          
          -- Asegurar que los administradores tengan el rol correcto
          -- Ajusta según tu lógica actual de administradores
          -- UPDATE users SET role = 'admin' WHERE is_admin = true;
          
          -- Agregar restricción CHECK
          ALTER TABLE users 
          ADD CONSTRAINT users_role_check 
          CHECK (role IN ('user', 'admin', 'premium', 'staff', 'gomero'));
        END IF;
      $$;
    `);
    // Crear función para actualizar automáticamente updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    // Crear trigger para pinchazo_alerts
    await client.query(`
      DROP TRIGGER IF EXISTS update_pinchazo_alerts_updated_at ON pinchazo_alerts;
      CREATE TRIGGER update_pinchazo_alerts_updated_at
      BEFORE UPDATE ON pinchazo_alerts
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
    // Función para registrar cambios en el historial
    await client.query(`
      CREATE OR REPLACE FUNCTION log_pinchazo_alert_change()
      RETURNS TRIGGER AS $$
      BEGIN
        INSERT INTO pinchazo_alert_history (alert_id, status, changed_by, notes)
        VALUES (NEW.id, NEW.status, NEW.gomero_id, 
          CASE 
            WHEN OLD.status = 'pending' AND NEW.status = 'accepted' THEN 'El gomero ha aceptado la solicitud'
            WHEN OLD.status = 'accepted' AND NEW.status = 'completed' THEN 'El servicio ha sido completado'
            WHEN OLD.status = 'accepted' AND NEW.status = 'cancelled' THEN 'El servicio ha sido cancelado'
            WHEN OLD.status = 'pending' AND NEW.status = 'rejected' THEN 'La solicitud ha sido rechazada'
            ELSE NULL
          END
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Tabla de gomeros
await client.query(`
  -- Eliminar la tabla si existe (opcional, ten cuidado en producción)
  DROP TABLE IF EXISTS gomeros CASCADE;
  -- Crear tabla de gomeros
  CREATE TABLE gomeros (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_available BOOLEAN NOT NULL DEFAULT true,
    current_lat DECIMAL(10, 8),
    current_lng DECIMAL(11, 8),
    rating DECIMAL(3, 2) DEFAULT 5.0,
    total_services INTEGER DEFAULT 0,
    phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
  );
  -- Crear índices para gomeros
  CREATE INDEX idx_gomeros_available ON gomeros(is_available);
  CREATE INDEX idx_gomeros_location ON gomeros(current_lat, current_lng);
  CREATE INDEX idx_gomeros_user ON gomeros(user_id);
`);
// Función para actualizar automáticamente updated_at
await client.query(`
  CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  -- Crear trigger para gomeros
  DROP TRIGGER IF EXISTS update_gomeros_updated_at ON gomeros;
  CREATE TRIGGER update_gomeros_updated_at
  BEFORE UPDATE ON gomeros
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
`);
    // Crear trigger para el historial
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_log_pinchazo_alert_change ON pinchazo_alerts;
      CREATE TRIGGER trigger_log_pinchazo_alert_change
      AFTER UPDATE OF status ON pinchazo_alerts
      FOR EACH ROW
      WHEN (OLD.status IS DISTINCT FROM NEW.status)
      EXECUTE FUNCTION log_pinchazo_alert_change();
    `);
    await client.query('COMMIT');
    console.log('Tablas de gomeros creadas con éxito');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando tablas de gomeros:', error);
    throw error;
  } finally {
    client.release();
  }
}

  // =================== MÉTODOS USUARIOS ===================
  createUser(userData) {
    return (async () => {
      const { nombre, email, password, moto, color, telefono } = userData;
      const sql = `
        INSERT INTO users (nombre, email, password, moto, color, telefono)
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

  getAllUsers() {
    return (async () => {
      const { rows } = await this.pool.query(`
        SELECT id, nombre, email, moto, color, telefono, created_at, status, role, premium_expires_at
        FROM users
        WHERE is_active = TRUE
      `);
      return rows;
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
         SET role = 'user', is_premium = false, premium_expires_at = NULL, updated_at = NOW() 
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

  // Verificar si un usuario es staff
async isStaff(userId) {
  const client = await this.pool.connect();
  try {
    const result = await client.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const userRole = result.rows[0].role;
    return userRole === 'staff';
  } catch (error) {
    console.error('Error en isStaff:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Verificar si es staff o admin (para verificar usuarios)
async isStaffOrAdmin(userId) {
  const client = await this.pool.connect();
  try {
    const result = await client.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return false;
    }

    const userRole = result.rows[0].role;
    return userRole === 'staff' || userRole === 'admin';
  } catch (error) {
    console.error('Error en isStaffOrAdmin:', error);
    throw error;
  } finally {
    client.release();
  }
}

makeStaff(id) {
  return (async () => {
    const result = await this.pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      ['staff', id]
    );
    return { changes: result.rowCount };
  })();
}

  // Verificar si un usuario es administrador
  async isAdmin(userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT role FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const userRole = result.rows[0].role;
      return userRole === 'admin';
    } catch (error) {
      console.error('Error en isAdmin:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async isPremium(userId) {
    const client = await this.pool.connect();
    try {
    // 1. Verificar si el usuario es admin o staff (siempre premium)
const adminOrStaffCheck = await client.query(
  'SELECT role FROM users WHERE id = $1 AND role IN ($2, $3) AND is_active = TRUE',
  [userId, 'admin', 'staff']
);

if (adminOrStaffCheck.rows.length > 0) return true;

      // 2. Verificar usuario premium con expiración
      const { rows } = await client.query(
        `SELECT role, is_premium, premium_expires_at, is_active 
         FROM users WHERE id = $1 AND is_active = TRUE`,
        [userId]
      );

      if (rows.length === 0) return false;

      const user = rows[0];

      // 3. Verificar si es premium por rol o por bandera is_premium
      const isPremiumUser = user.role === 'premium' || user.is_premium === true;

      if (!isPremiumUser) return false;

      // 4. Si no tiene fecha de expiración, es premium permanente
      if (!user.premium_expires_at) return true;

      // 5. Verificar si la suscripción ha expirado
      const now = new Date();
      const expiresAt = new Date(user.premium_expires_at);

      if (now > expiresAt) {
        // 6. Si expiró, actualizar el estado
        await client.query(
          `UPDATE users 
           SET role = $1, 
               is_premium = false, 
               premium_expires_at = NULL, 
               updated_at = NOW() 
           WHERE id = $2`,
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
    console.log(`[DEBUG] activatePremiumSubscription - paymentId: ${paymentId}, paymentData:`, paymentData);

    if (!paymentId) {
      throw new Error(`paymentId inválido: ${paymentId}`);
    }

    const client = await this.pool.connect();
    let userId = null;

    try {
      await client.query('BEGIN');
      // Buscar solo pagos aprobados
      const paymentResult = await client.query(
        `SELECT * FROM payments
   WHERE (mercadopago_payment_id = $1 OR preference_id = $1)
     AND status = 'approved'`,
        [paymentId.toString()]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error(`No se puede activar premium: pago no encontrado o no aprobado`);
      }

      const payment = paymentResult.rows[0];
      userId = payment.user_id;
      const status = payment.status;

      // Si el pago ya fue procesado, verificar la suscripción
      if (status === 'approved' || status === 'completed') {
        console.log(`[INFO] El pago ya fue procesado con estado: ${status}, verificando suscripción...`);

        const subscriptionCheck = await client.query(
          `SELECT * FROM premium_subscriptions 
           WHERE mercadopago_payment_id = $1 AND is_active = true`,
          [payment.mercadopago_payment_id || paymentId]
        );

        if (subscriptionCheck.rows.length > 0) {
          console.log(`[INFO] El usuario ya tiene una suscripción activa para este pago`);
          return {
            success: true,
            message: `El usuario ya tiene una suscripción activa para este pago`,
            alreadyProcessed: true
          };
        }
        // Si no hay suscripción activa, continuar con la activación
        console.log(`[INFO] Reactivando suscripción para pago aprobado previamente`);
      }
      // Si el pago no está aprobado ni completado
      else if (status !== 'pending') {
        throw new Error(`Estado de pago inesperado: ${status}`);
      }

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1); // 1 mes de suscripción

      console.log(`[DEBUG] Procesando pago para usuario ID: ${userId}, paymentId: ${paymentId}`);

      // 2. Desactivar suscripciones activas anteriores
      await client.query(
        `UPDATE premium_subscriptions
         SET is_active = false, 
             updated_at = NOW()
         WHERE user_id = $1 AND is_active = true`,
        [userId]
      );
      const existingSubscription = await client.query(
        `SELECT * FROM premium_subscriptions 
         WHERE mercadopago_payment_id = $1`,
        [paymentId]
      );

      // Si ya existe una suscripción activa, no hacer nada
      if (existingSubscription.rows.length > 0 && existingSubscription.rows[0].is_active) {
        await client.query('COMMIT');
        return {
          success: true,
          message: 'Suscripción ya activada previamente',
          subscription: existingSubscription.rows[0],
          alreadyProcessed: true
        };
      }

      // 4. Crear o actualizar suscripción (evita error de clave duplicada)
      const subscriptionResult = await client.query(
        `INSERT INTO premium_subscriptions (
      user_id,
      mercadopago_payment_id,
      start_date,
      end_date,
      is_active
  ) VALUES ($1, $2, $3, $4, true)
  ON CONFLICT (mercadopago_payment_id)
  DO UPDATE SET
      is_active = EXCLUDED.is_active,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      updated_at = NOW()
  RETURNING *;`,
        [userId, payment.id, startDate, endDate]
      );

      // 5. Actualizar el usuario a premium
      await client.query(
        `UPDATE users 
         SET is_premium = true,
             premium_expires_at = $1,
             role = 'premium',
             updated_at = NOW()
         WHERE id = $2`,
        [endDate, userId]
      );

      await client.query('COMMIT');

      console.log(`[SUCCESS] Suscripción premium activada para usuario ${userId}`);
      return {
        success: true,
        message: 'Suscripción premium activada correctamente',
        endDate: endDate.toISOString(),
        subscription: subscriptionResult.rows[0]
      };

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en activatePremiumSubscription:', {
        paymentId,
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserSubscriptions(userId) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT ps.*, p.amount, p.currency, p.status as payment_status, p.created_at as payment_date, p.mercadopago_payment_id
         FROM premium_subscriptions ps
         LEFT JOIN payments p ON p.mercadopago_payment_id = ps.mercadopago_payment_id
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

      // Validar solo los campos mínimos necesarios
      const requiredFields = ['user_id', 'preference_id', 'amount', 'currency'];
      const missingFields = requiredFields.filter(field => !paymentData[field]);

      if (missingFields.length > 0) {
        throw new Error(`Campos requeridos faltantes: ${missingFields.join(', ')}`);
      }

      const {
        user_id,
        preference_id,
        amount,
        currency,
        subscription_id = null,
        status = 'pending',
        mercadopago_payment_id = null,
        payment_method_id = null,
        payment_type_id = null
      } = paymentData;

      console.log(`[PAYMENT] Guardando pago para usuario ${user_id}, preferencia: ${preference_id}`);

      // Insertar o actualizar si ya existe la preferencia
      const result = await client.query(
        `INSERT INTO payments (
        user_id, 
        preference_id, 
        amount, 
        currency, 
        subscription_id,
        status,
        mercadopago_payment_id,
        payment_method_id,
        payment_type_id,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (preference_id) 
      DO UPDATE SET
        status = EXCLUDED.status,
        mercadopago_payment_id = COALESCE(EXCLUDED.mercadopago_payment_id, payments.mercadopago_payment_id),
        payment_method_id = COALESCE(EXCLUDED.payment_method_id, payments.payment_method_id),
        payment_type_id = COALESCE(EXCLUDED.payment_type_id, payments.payment_type_id),
        updated_at = NOW()
      RETURNING *`,
        [
          user_id,
          preference_id,
          amount,
          currency,
          subscription_id,
          status,
          mercadopago_payment_id,
          payment_method_id,
          payment_type_id
        ]
      );

      await client.query('COMMIT');
      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error en savePaymentDetails:', {
        error: error.message,
        paymentData: {
          ...paymentData,
          card_token: paymentData.card_token ? '[FILTRADO]' : undefined
        }
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // =================== gomeria-movil ===================
// Métodos para gomeros
getGomeros() {
  return (async () => {
    const result = await this.pool.query(
      `SELECT id, nombre, email, telefono, created_at 
       FROM users 
       WHERE role = 'gomero' AND is_active = TRUE`
    );
    return result.rows;
  })();
}

getGomerosCercanos(lat, lng, radiusKm = 10) {
  return (async () => {
    // Radio de la Tierra en kilómetros
    const earthRadiusKm = 6371;
    
    const query = `
      SELECT 
        id, 
        nombre, 
        email, 
        telefono,
        last_known_lat, 
        last_known_lng,
        ${earthRadiusKm} * 
          acos(
            cos(radians($1)) * 
            cos(radians(last_known_lat)) * 
            cos(radians(last_known_lng) - radians($2)) + 
            sin(radians($1)) * 
            sin(radians(last_known_lat))
          ) AS distance
      FROM users
      WHERE role = 'gomero' 
        AND is_active = TRUE
        AND last_known_lat IS NOT NULL
        AND last_known_lng IS NOT NULL
      HAVING ${earthRadiusKm} * 
        acos(
          cos(radians($1)) * 
          cos(radians(last_known_lat)) * 
          cos(radians(last_known_lng) - radians($2)) + 
          sin(radians($1)) * 
          sin(radians(last_known_lat))
        ) <= $3
      ORDER BY distance
      LIMIT 20
    `;
    
    const result = await this.pool.query(query, [lat, lng, radiusKm]);
    return result.rows;
  })();
}

createPinchazoAlert(alertData) {
  return (async () => {
    const { userId, lat, lng, notes } = alertData;
    const result = await this.pool.query(
      `INSERT INTO pinchazo_alerts 
       (user_id, location_lat, location_lng, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, lat, lng, notes || null]
    );
    return result.rows[0];
  })();
}

updatePinchazoAlertStatus(alertId, status, gomeroId = null) {
  return (async () => {
    const result = await this.pool.query(
      `UPDATE pinchazo_alerts
       SET status = $1,
           gomero_id = CASE WHEN $2 IS NOT NULL THEN $2 ELSE gomero_id END,
           updated_at = NOW(),
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
           canceled_at = CASE WHEN $1 = 'cancelled' THEN NOW() ELSE canceled_at END
       WHERE id = $3
       RETURNING *`,
      [status, gomeroId, alertId]
    );
    return result.rows[0] || null;
  })();
}

getUserPinchazoAlerts(userId) {
  return (async () => {
    const result = await this.pool.query(
      `SELECT pa.*, 
              u1.nombre as user_nombre, u1.telefono as user_telefono,
              u2.nombre as gomero_nombre, u2.telefono as gomero_telefono
       FROM pinchazo_alerts pa
       JOIN users u1 ON pa.user_id = u1.id
       LEFT JOIN users u2 ON pa.gomero_id = u2.id
       WHERE pa.user_id = $1
       ORDER BY pa.created_at DESC`,
      [userId]
    );
    return result.rows;
  })();
}

getGomeroPinchazoAlerts(gomeroId, status = null) {
  return (async () => {
    let query = `
      SELECT pa.*, 
             u.nombre as user_nombre, u.telefono as user_telefono
      FROM pinchazo_alerts pa
      JOIN users u ON pa.user_id = u.id
      WHERE (pa.gomero_id = $1 OR (pa.gomero_id IS NULL AND pa.status = 'pending'))
    `;
    
    const params = [gomeroId];
    
    if (status) {
      query += ' AND pa.status = $2';
      params.push(status);
    }
    
    query += ' ORDER BY pa.created_at DESC';
    
    const result = await this.pool.query(query, params);
    return result.rows;
  })();
}

getPinchazoAlertHistory(alertId) {
  return (async () => {
    const result = await this.pool.query(
      `SELECT h.*, u.nombre as changed_by_name
       FROM pinchazo_alert_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.alert_id = $1
       ORDER BY h.created_at ASC`,
      [alertId]
    );
    return result.rows;
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

  getUserDeviceTokens(userId) {
    return (async () => {
      const { rows } = await this.pool.query(
        'SELECT token FROM device_tokens WHERE user_id = $1',
        [userId]
      );
      return rows.map(r => r.token);
    })();
  }

  getAllTokens() {
    return (async () => {
      const { rows } = await this.pool.query('SELECT token FROM device_tokens');
      return rows.map(r => r.token);
    })();
  }

  // En sos-backend/database.js
  deleteDeviceToken(userId, token) {
    return (async () => {
      const sql = 'DELETE FROM device_tokens WHERE user_id = $1 AND token = $2';
      const { rowCount } = await this.pool.query(sql, [userId, token]);
      return { deleted: rowCount > 0 };
    })();
  }

  deleteTokens(tokens) {
    return (async () => {
      if (!tokens || tokens.length === 0) {
        return { deleted: 0 };
      }
      const placeholders = tokens.map((_, i) => `$${i + 1}`).join(',');
      const sql = `DELETE FROM device_tokens WHERE token IN (${placeholders})`;
      const { rowCount } = await this.pool.query(sql, tokens);
      return { deleted: rowCount };
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
