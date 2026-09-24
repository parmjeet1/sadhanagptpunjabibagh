require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool, testConnection } = require('../config/db');

async function runSeeds() {
  console.log('🌱 Seeding database with sample data...\n');

  try {
    await testConnection();
    const connection = await pool.getConnection();

    // ─── Seed Users (Drivers) ────────────────────────────────────────────────
    const drivers = [
      { id: uuidv4(), name: 'Josh Singh',    mobile: '+919876543210', password: 'password123', role: 'driver' },
      { id: uuidv4(), name: 'Priya Agarwal', mobile: '+919876543211', password: 'password123', role: 'driver' },
      { id: uuidv4(), name: 'Ravi Kumar',    mobile: '+919876543212', password: 'password123', role: 'driver' },
      { id: uuidv4(), name: 'Anita Sharma',  mobile: '+919876543213', password: 'password123', role: 'driver' },
    ];

    console.log('  Seeding users...');
    for (const driver of drivers) {
      const hashed = await bcrypt.hash(driver.password, 10);
      await connection.execute(
        `INSERT IGNORE INTO users (id, name, mobile, password, role) VALUES (?, ?, ?, ?, ?)`,
        [driver.id, driver.name, driver.mobile, hashed, driver.role]
      );
    }
    console.log(`  ✅ ${drivers.length} drivers seeded`);

    // ─── Fetch inserted user IDs ─────────────────────────────────────────────
    const [users] = await connection.execute(`SELECT id, name, mobile FROM users LIMIT 10`);
    const userMap = {};
    users.forEach(u => { userMap[u.mobile] = u.id; });

    // ─── Seed Vehicles ───────────────────────────────────────────────────────
    const vehicles = [
      { id: uuidv4(), mobile: '+919876543210', number: 'UK07-AL-5523' },
      { id: uuidv4(), mobile: '+919876543211', number: 'DL-01-CQ-9901' },
      { id: uuidv4(), mobile: '+919876543212', number: 'HR26-DZ-3847' },
      { id: uuidv4(), mobile: '+919876543213', number: 'MH01-AB-1234' },
    ];

    console.log('  Seeding vehicles...');
    for (const v of vehicles) {
      const userId = userMap[v.mobile];
      if (userId) {
        await connection.execute(
          `INSERT IGNORE INTO vehicles (id, user_id, vehicle_number) VALUES (?, ?, ?)`,
          [v.id, userId, v.number]
        );
      }
    }
    console.log(`  ✅ ${vehicles.length} vehicles seeded`);

    // ─── Seed Rides ──────────────────────────────────────────────────────────
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const formatDate = (d) => d.toISOString().split('T')[0];

    const rides = [
      {
        id: uuidv4(),
        user_id: userMap['+919876543210'],
        driver_name: 'Josh Singh',
        phone_number: '+919876543210',
        vehicle_number: 'UK07-AL-5523',
        from_location: 'Joshimath Main Square',
        to_location: 'Dehradun ISBT',
        travel_date: formatDate(today),
        travel_time: '11:00:00',
        booking_frequency: 'today_only',
        price: 850.00,
        price_mode: 'fixed',
        max_luggage: 'medium',
        status: 'active',
      },
      {
        id: uuidv4(),
        user_id: userMap['+919876543211'],
        driver_name: 'Priya Agarwal',
        phone_number: '+919876543211',
        vehicle_number: 'DL-01-CQ-9901',
        from_location: 'Rishikesh Ghat',
        to_location: 'Delhi IGI Airport',
        travel_date: formatDate(tomorrow),
        travel_time: '08:30:00',
        booking_frequency: 'every_day',
        price: 1200.00,
        price_mode: 'negotiable',
        max_luggage: 'small',
        status: 'active',
      },
      {
        id: uuidv4(),
        user_id: userMap['+919876543212'],
        driver_name: 'Ravi Kumar',
        phone_number: '+919876543212',
        vehicle_number: 'HR26-DZ-3847',
        from_location: 'Haridwar Railway Station',
        to_location: 'Noida Sector 62',
        travel_date: formatDate(today),
        travel_time: '07:00:00',
        booking_frequency: 'week_days',
        price: 950.00,
        price_mode: 'fixed',
        max_luggage: 'large',
        status: 'active',
      },
      {
        id: uuidv4(),
        user_id: userMap['+919876543213'],
        driver_name: 'Anita Sharma',
        phone_number: '+919876543213',
        vehicle_number: 'MH01-AB-1234',
        from_location: 'Gurgaon Cyber City',
        to_location: 'Airport T3',
        travel_date: formatDate(tomorrow),
        travel_time: '05:30:00',
        booking_frequency: 'specific_date',
        specific_date: formatDate(tomorrow),
        price: 700.00,
        price_mode: 'negotiable',
        max_luggage: 'none',
        status: 'active',
      },
    ];

    console.log('  Seeding rides...');
    for (const ride of rides) {
      if (!ride.user_id) continue;
      await connection.execute(
        `INSERT IGNORE INTO rides 
          (id, user_id, driver_name, phone_number, vehicle_number,
           from_location, to_location, travel_date, travel_time,
           booking_frequency, specific_date, price, price_mode,
           max_luggage, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ride.id, ride.user_id, ride.driver_name, ride.phone_number,
          ride.vehicle_number, ride.from_location, ride.to_location,
          ride.travel_date, ride.travel_time, ride.booking_frequency,
          ride.specific_date || null, ride.price, ride.price_mode,
          ride.max_luggage, ride.status,
        ]
      );
    }
    console.log(`  ✅ ${rides.length} rides seeded`);

    connection.release();
    console.log('\n🎉 Seeding completed successfully!\n');
    console.log('Sample login credentials:');
    console.log('  Mobile: +919876543210  |  Password: password123');
    console.log('  Mobile: +919876543211  |  Password: password123\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

runSeeds();
