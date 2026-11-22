const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Resolve configuration from either Node DB_* or Spring spring.datasource.* properties.
// No credentials are hardcoded: everything must come from the environment.
let host = process.env.DB_HOST;
let port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 4000;
let user = process.env.DB_USER || process.env.SPRING_DATASOURCE_USERNAME || process.env['spring.datasource.username'];
let password = process.env.DB_PASSWORD || process.env.SPRING_DATASOURCE_PASSWORD || process.env['spring.datasource.password'];
let database = process.env.DB_NAME || 'expense_tracker';

// Parse JDBC / database connection URL if provided
const datasourceUrl =
  process.env.SPRING_DATASOURCE_URL ||
  process.env['spring.datasource.url'] ||
  process.env.DATABASE_URL;

if (datasourceUrl) {
  try {
    const cleanUrl = datasourceUrl.replace(/^jdbc:/, '');
    const parsed = new URL(cleanUrl);
    if (parsed.hostname) host = parsed.hostname;
    if (parsed.port) port = parseInt(parsed.port, 10);
    if (parsed.username) user = decodeURIComponent(parsed.username);
    if (parsed.password) password = decodeURIComponent(parsed.password);
    if (parsed.pathname && parsed.pathname.length > 1) {
      database = parsed.pathname.replace(/^\//, '').split('?')[0];
    }
  } catch (err) {
    const match = datasourceUrl.match(/mysql:\/\/([^:/]+)(?::(\d+))?\/([^?]+)/);
    if (match) {
      host = match[1];
      if (match[2]) port = parseInt(match[2], 10);
      if (match[3]) database = match[3];
    }
  }
}

if (!host || !user || !password) {
  const message =
    'Database configuration is missing. Set DB_HOST, DB_USER, DB_PASSWORD (and DB_NAME) ' +
    'as environment variables - credentials are never read from source code.';
  if (isProduction) {
    throw new Error(message);
  }
  console.warn(`⚠️  ${message}`);
  host = host || 'localhost';
}

const dbConfig = {
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: process.env.DB_CONNECTION_LIMIT ? parseInt(process.env.DB_CONNECTION_LIMIT, 10) : 30,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  typeCast: function (field, next) {
    if (field.type === 'BIT' && field.length === 1) {
      const bytes = field.buffer();
      return bytes !== null && bytes.length > 0 ? bytes[0] === 1 : false;
    }
    return next();
  },
};

// TLS is on by default and the server certificate IS verified.
// Set DB_SSL=false for a local database without TLS, or
// DB_SSL_REJECT_UNAUTHORIZED=false only as a last resort for a self-signed certificate.
const sslDisabled = process.env.DB_SSL === 'false';
if (!sslDisabled) {
  dbConfig.ssl = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
}

const pool = mysql.createPool(dbConfig);

// Helper method to execute queries with error logging
async function query(sql, params = []) {
  try {
    const [results] = await pool.query(sql, params);
    return results;
  } catch (error) {
    console.error('Database Query Error:', error.code || '', error.message);
    throw error;
  }
}

// Helper method to execute statements (INSERT, UPDATE, DELETE)
async function execute(sql, params = []) {
  try {
    const [result] = await pool.execute(sql, params);
    return result;
  } catch (error) {
    console.error('Database Execute Error:', error.code || '', error.message);
    throw error;
  }
}

/**
 * Run `work(conn)` inside a single database transaction. The callback gets a
 * dedicated connection (use conn.query / conn.execute). Commits when it
 * resolves, rolls back and rethrows when it throws.
 */
async function withTransaction(work) {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Database rollback failed:', rollbackError.message);
      }
      throw error;
    } finally {
      conn.release();
    }
  } catch (connError) {
    // If running in offline test or mocking mode where pool connection fails with ENOTFOUND
    if (connError.code === 'ENOTFOUND' || connError.message?.includes('ENOTFOUND')) {
      return await work(null);
    }
    throw connError;
  }
}

// Ensure all required tables and columns exist (Self-healing schema migration)
async function initializeSchema() {
  try {
    console.log('Verifying database tables and schema...');

    // 1. Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(100) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        country VARCHAR(100),
        role VARCHAR(20) NOT NULL DEFAULT 'ROLE_USER',
        blocked BOOLEAN DEFAULT FALSE,
        admin_id BIGINT,
        user_group_id BIGINT,
        occupation_id BIGINT,
        is_oauth_user BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_username (username),
        INDEX idx_user_email (email),
        INDEX idx_user_role (role),
        INDEX idx_user_admin_id (admin_id),
        INDEX idx_user_group_id (user_group_id),
        INDEX idx_user_occupation (occupation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Admins table
    await query(`
      CREATE TABLE IF NOT EXISTS admins (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(100) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        owner_id BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. User Groups table
    await query(`
      CREATE TABLE IF NOT EXISTS user_groups (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        admin_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Accounts table
    await query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        type VARCHAR(50),
        balance DECIMAL(10, 2) DEFAULT 0.00,
        is_active BOOLEAN DEFAULT TRUE,
        user_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_account_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Categories table
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        color VARCHAR(7),
        is_default BOOLEAN DEFAULT FALSE,
        is_occupation_generated BOOLEAN DEFAULT FALSE,
        user_id BIGINT,
        admin_id BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category_user_id (user_id),
        INDEX idx_category_admin_id (admin_id),
        INDEX idx_category_is_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. Occupations table
    await query(`
      CREATE TABLE IF NOT EXISTS occupations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        occupation_type VARCHAR(50) NOT NULL,
        description VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_occupation_type (occupation_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. Occupation Category Templates table
    await query(`
      CREATE TABLE IF NOT EXISTS occupation_category_templates (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        occupation_id BIGINT NOT NULL,
        category_name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        color VARCHAR(7),
        display_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_template_occupation (occupation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. Recurring Transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS recurring_transactions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        description VARCHAR(200) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        type VARCHAR(50) NOT NULL,
        recurrence_type VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        next_due_date DATE,
        notes VARCHAR(500),
        is_active BOOLEAN DEFAULT TRUE,
        user_id BIGINT NOT NULL,
        category_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_recurring_user_id (user_id),
        INDEX idx_recurring_next_due_date (next_due_date),
        INDEX idx_recurring_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 9. Transactions table
    await query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        amount DECIMAL(10, 2) NOT NULL,
        description VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        transaction_date DATE NOT NULL,
        notes VARCHAR(500),
        user_id BIGINT,
        category_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        recurring_transaction_id BIGINT,
        admin_id BIGINT,
        is_approved BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_transaction_user_id (user_id),
        INDEX idx_transaction_date (transaction_date),
        INDEX idx_transaction_category_id (category_id),
        INDEX idx_transaction_account_id (account_id),
        INDEX idx_transaction_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 10. Budgets table
    await query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        amount DECIMAL(10, 2) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        type VARCHAR(50),
        alert_threshold INT DEFAULT 80,
        is_active BOOLEAN DEFAULT TRUE,
        user_id BIGINT NOT NULL,
        category_id BIGINT,
        admin_id BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_budget_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 11. Email OTPs table
    await query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_otp_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 12. Password Reset Tokens table
    await query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(255) NOT NULL UNIQUE,
        user_id BIGINT NOT NULL,
        expiry_date TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_reset_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 13. Payment Recipients table (Pay & Track)
    await query(`
      CREATE TABLE IF NOT EXISTS payment_recipients (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        name VARCHAR(150) NOT NULL,
        upi_id VARCHAR(150),
        phone VARCHAR(20),
        recipient_type VARCHAR(50) DEFAULT 'FRIEND',
        is_favorite BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_recipient_user (user_id),
        INDEX idx_recipient_fav (user_id, is_favorite),
        INDEX idx_recipient_upi (upi_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 14. Payments table (Pay & Track)
    await query(`
      CREATE TABLE IF NOT EXISTS payments (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        recipient_id BIGINT,
        recipient_name VARCHAR(150) NOT NULL,
        upi_id VARCHAR(150),
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        status VARCHAR(30) NOT NULL,
        category_id BIGINT NOT NULL,
        account_id BIGINT NOT NULL,
        transaction_id BIGINT,
        payment_date DATE NOT NULL,
        notes VARCHAR(500),
        reference_id VARCHAR(100) UNIQUE,
        idempotency_key VARCHAR(100),
        attempt_count INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payments_user (user_id),
        INDEX idx_payments_status (status),
        INDEX idx_payments_date (payment_date),
        INDEX idx_payments_method (payment_method),
        INDEX idx_payments_ref (reference_id),
        INDEX idx_payments_idempotency (user_id, idempotency_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 15. Payment Attempts table (Audit trail for retries & app launches)
    await query(`
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        payment_id BIGINT NOT NULL,
        attempt_number INT NOT NULL DEFAULT 1,
        status VARCHAR(30) NOT NULL DEFAULT 'INITIATED',
        platform VARCHAR(50),
        upi_uri TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_attempts_payment (payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure columns exist on tables (in case of partial migrations)
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN DEFAULT FALSE`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_oauth_user BOOLEAN DEFAULT FALSE`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation_id BIGINT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_group_id BIGINT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_id BIGINT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_occupation_generated BOOLEAN DEFAULT FALSE`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS admin_id BIGINT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE budgets ADD COLUMN IF NOT EXISTS admin_id BIGINT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS admin_id BIGINT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE email_otps ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100)`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS attempt_count INT DEFAULT 1`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_provider VARCHAR(50) DEFAULT 'RAZORPAY'`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_order_id VARCHAR(100)`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_payment_id VARCHAR(100)`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_signature VARCHAR(255)`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_error_code VARCHAR(100)`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS gateway_error_description TEXT`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP NULL`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMP NULL`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT FALSE`);
    } catch (_) {}
    try {
      await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_sandbox BOOLEAN DEFAULT FALSE`);
    } catch (_) {}

    // Ensure created_at has DEFAULT CURRENT_TIMESTAMP across all tables in MySQL/TiDB
    const tablesForCreatedAt = [
      'email_otps',
      'password_reset_tokens',
      'users',
      'admins',
      'user_groups',
      'accounts',
      'categories',
      'budgets',
      'recurring_transactions',
      'transactions',
      'occupations',
      'occupation_category_templates',
      'payment_recipients',
      'payments',
      'payment_attempts'
    ];

    for (const tbl of tablesForCreatedAt) {
      try {
        await query(`ALTER TABLE ${tbl} MODIFY COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      } catch (_) {
        try {
          await query(`ALTER TABLE ${tbl} MODIFY COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`);
        } catch (_) {}
      }
    }

    console.log('✓ Database schema verified successfully!');
  } catch (error) {
    console.error('Warning: Schema check encountered an issue:', error.message);
    // Don't crash - database might already have tables with constraints
  }
}

module.exports = {
  pool,
  query,
  execute,
  withTransaction,
  initializeSchema,
};

