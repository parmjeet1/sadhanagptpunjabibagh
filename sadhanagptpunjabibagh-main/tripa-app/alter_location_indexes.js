import tripaEnv from './src/config/env.js';
import mysql from 'mysql2/promise';

const applyIndexes = async () => {
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

    console.log('Adding index on from_location...');
    await pool.query('CREATE INDEX idx_rides_from_location ON rides(from_location)');

    console.log('Adding index on to_location...');
    await pool.query('CREATE INDEX idx_rides_to_location ON rides(to_location)');

    console.log('✅ Indexes added successfully!');
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_KEYNAME') {
      console.log('✅ Indexes already exist. Skipping.');
    } else {
      console.error('❌ Error adding indexes:', error.message);
    }
    process.exit(1);
  }
};

applyIndexes();
