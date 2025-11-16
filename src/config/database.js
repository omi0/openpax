const { Pool } = require('pg');

/**
 * PostgreSQL Database Configuration
 */
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restaurant_db',
  port: process.env.DB_PORT || 5433,
  max: 20,                      // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,     // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Database connected successfully');
    client.release();
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
};

// Test connection on startup
testConnection();

/**
 * Execute parameterized query
 */
const execute = async (query, params = []) => {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return [result];
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute query (alias for execute)
 */
const query = async (sql, params = []) => {
  return execute(sql, params);
};

/**
 * Close pool (graceful shutdown)
 */
const closePool = async () => {
  try {
    await pool.end();
    console.log('Database pool closed');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
  }
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
});

module.exports = {
  pool,
  execute,
  query,
  testConnection,
  closePool
};
