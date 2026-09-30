import tripaEnv from './src/config/env.js';
import mysql from 'mysql2/promise';

const applyAlterTable = async () => {
  const dbConfig = {
    host: tripaEnv.DB_HOST,
    port: tripaEnv.DB_PORT,
    user: tripaEnv.DB_USER,
    password: tripaEnv.DB_PASSWORD,
    database: tripaEnv.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  try {
    console.log('Connecting to database...');
    const pool = mysql.createPool(dbConfig);

    console.log('Altering rides table to add column ride_type...');
    await pool.query("ALTER TABLE rides ADD COLUMN ride_type VARCHAR(20) NOT NULL DEFAULT 'sharing'");

    console.log('✅ Column ride_type added successfully!');
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('✅ Column ride_type already exists. Skipping.');
      process.exit(0);
    } else {
      console.error('❌ Error altering table:', error.message);
      process.exit(1);
    }
  }
};

applyAlterTable();
