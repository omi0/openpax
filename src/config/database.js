const { Pool } = require('pg');
const logger = require('./logger');

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'auth_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: process.env.DB_POOL_SIZE || 20,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT || 30000,
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT || 2000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Error handling
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function for queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    // Only log slow queries in production
    if (duration > 100 || process.env.NODE_ENV === 'development') {
      logger.debug({ 
        sql: text.substring(0, 100), // First 100 chars
        duration, 
        rows: result.rowCount 
      }, 'Query executed');
    }
    return result;
  } catch (error) {
    logger.error({ 
      err: error, 
      sql: text.substring(0, 100) 
    }, 'Database query error');
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ err: error }, 'Transaction rolled back');
    throw error;
  } finally {
    client.release();
  }
};

// Test connection
const testConnection = async () => {
  try {
    const result = await query('SELECT NOW()');
    logger.info({ time: result.rows[0].now }, 'Database connected successfully');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database connection failed');
    return false;
  }
};

module.exports = {
  pool,
  query,
  transaction,
  testConnection
};