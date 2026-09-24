import mysql2 from 'mysql2/promise';
import tripaEnv from './env.js';

const pool = mysql2.createPool({
  host: tripaEnv.DB_HOST || 'localhost',
  port: parseInt(tripaEnv.DB_PORT) || 3306,
  user: tripaEnv.DB_USER || 'root',
  password: tripaEnv.DB_PASSWORD || '',
  database: tripaEnv.DB_NAME || 'tripa_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
  charset: 'utf8mb4',
});

/**
 * Execute a SQL query with parameterized values.
 * @param {string} sql - The SQL query string
 * @param {Array} params - Array of parameter values
 * @returns {Promise<[rows, fields]>}
 */
export const query = async (sql, params = []) => {
  const [rows, fields] = await pool.execute(sql, params);
  return [rows, fields];
};

/**
 * Test the database connection on startup.
 */
export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Tripa MySQL connected successfully');
    console.log(`   Host: ${tripaEnv.DB_HOST}:${tripaEnv.DB_PORT || 3306}`);
    console.log(`   Database: ${tripaEnv.DB_NAME}`);
    connection.release();
  } catch (error) {
    console.error('❌ Tripa MySQL connection failed:', error.message);
    throw error;
  }
};

export { pool };
