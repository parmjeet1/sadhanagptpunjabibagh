require('dotenv').config();
const { pool, testConnection } = require('../config/db');

async function runAlter() {
  console.log('🔄 Running alter table migration...\n');
  try {
    await testConnection();
    const connection = await pool.getConnection();

    const alters = [
      'ALTER TABLE rides ADD COLUMN from_lat DECIMAL(10, 8) NULL AFTER from_location',
      'ALTER TABLE rides ADD COLUMN from_lng DECIMAL(11, 8) NULL AFTER from_lat',
      'ALTER TABLE rides ADD COLUMN to_lat DECIMAL(10, 8) NULL AFTER to_location',
      'ALTER TABLE rides ADD COLUMN to_lng DECIMAL(11, 8) NULL AFTER to_lat'
    ];

    for (const sql of alters) {
      try {
        await connection.query(sql);
        console.log(`  ✅ Successfully ran: ${sql}`);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`  ℹ️ Column already exists, skipping: ${sql}`);
        } else {
          console.error(`  ❌ Failed to run '${sql}': ${err.message}`);
        }
      }
    }

    connection.release();
    console.log('\n✅ Alter migration completed successfully!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  }
}

runAlter();
