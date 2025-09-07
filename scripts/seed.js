const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedDatabase() {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting database seeding...');
    await client.query('BEGIN');

    console.log('👤 Creating admin user...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    await client.query(`
      INSERT INTO users (email, password_hash, role, name, phone, is_active)
      VALUES ($1, $2, 'admin', 'System Administrator', '+91-9999999999', true)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
    `, ['admin@safarsathi.com', adminPassword]);
    console.log('✅ Admin user created/updated: admin@safarsathi.com / admin123');

    console.log('🛣️  Creating sample routes...');
    const routes = [
      { name: 'Route 1: City Center - Airport', description: 'Main route connecting city center to Jolly Grant Airport', color: '#E53E3E' },
      { name: 'Route 2: ISBT - University', description: 'Inter State Bus Terminal to University route', color: '#3182CE' },
      { name: 'Route 3: Clock Tower - Hospital', description: 'Clock Tower to General Hospital via main roads', color: '#38A169' },
    ];
    const routeIds = [];
    for (const route of routes) {
      const result = await client.query(
        `INSERT INTO routes (name, description, color, is_active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [route.name, route.description, route.color]
      );
      if (result.rows[0]) routeIds.push(result.rows[0].id);
    }

    console.log('🚏 Creating bus stops...');
    const busStops = [
      { name: 'City Center', lat: 30.3165, lng: 78.0322, address: 'Main City Center, Dehradun' },
      { name: 'Clock Tower', lat: 30.3204, lng: 78.0348, address: 'Clock Tower, Dehradun' },
      { name: 'ISBT Dehradun', lat: 30.3254, lng: 78.0423, address: 'Inter State Bus Terminal, Dehradun' },
      { name: 'Jolly Grant Airport', lat: 30.1872, lng: 78.1802, address: 'Jolly Grant Airport, Dehradun' },
    ];
    const stopIds = [];
    for (const stop of busStops) {
      const result = await client.query(
        `INSERT INTO bus_stops (name, location, address, amenities, is_active)
         VALUES ($1, ST_GeogFromText($2), $3, $4, true)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [stop.name, `POINT(${stop.lng} ${stop.lat})`, stop.address, []]
      );
      if (result.rows[0]) stopIds.push({ id: result.rows[0].id, name: stop.name });
    }

    if (routeIds.length > 0 && stopIds.length >= 4) {
      const route1Stops = [
        { stopName: 'City Center', order: 1, travelTime: 0 },
        { stopName: 'Clock Tower', order: 2, travelTime: 300 },
        { stopName: 'ISBT Dehradun', order: 3, travelTime: 600 },
        { stopName: 'Jolly Grant Airport', order: 4, travelTime: 2400 },
      ];
      for (const routeStop of route1Stops) {
        const stop = stopIds.find(s => s.name === routeStop.stopName);
        if (stop) {
          await client.query(
            `INSERT INTO route_stops (route_id, bus_stop_id, stop_order, estimated_travel_time)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (route_id, bus_stop_id) DO NOTHING`,
            [routeIds[0], stop.id, routeStop.order, routeStop.travelTime]
          );
        }
      }
    }

    console.log('🚌 Creating sample vehicles and drivers...');
    const drivers = [
      { email: 'driver1@safarsathi.com', password: 'driver123', name: 'Rajesh Kumar', phone: '+91-9876543210', license: 'DL-UK-2019-0001234' },
      { email: 'driver2@safarsathi.com', password: 'driver123', name: 'Amit Singh', phone: '+91-9876543211', license: 'DL-UK-2020-0005678' },
    ];
    const driverIds = [];
    for (const d of drivers) {
      const hashed = await bcrypt.hash(d.password, 12);
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, name, phone, is_active)
         VALUES ($1, $2, 'driver', $3, $4, true)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = NOW()
         RETURNING id`,
        [d.email, hashed, d.name, d.phone]
      );
      const userId = userResult.rows[0].id;
      const driverResult = await client.query(
        `INSERT INTO drivers (user_id, license_number, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (license_number) DO UPDATE SET status = 'active', updated_at = NOW()
         RETURNING id`,
        [userId, d.license]
      );
      driverIds.push(driverResult.rows[0].id);
    }

    const vehicles = [
      { registration: 'UK-05-AA-1234', model: 'Tata Starbus', capacity: 40, fuel: 'diesel' },
      { registration: 'UK-05-BB-5678', model: 'Ashok Leyland Viking', capacity: 45, fuel: 'cng' },
    ];
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      await client.query(
        `INSERT INTO vehicles (registration_number, model, capacity, fuel_type, assigned_driver_id, assigned_route_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')
         ON CONFLICT (registration_number) DO UPDATE SET model=$2, capacity=$3, assigned_driver_id=$5, assigned_route_id=$6, updated_at=NOW()`,
        [v.registration, v.model, v.capacity, v.fuel, driverIds[i] || null, routeIds[0] || null]
      );
    }

    await client.query('COMMIT');
    console.log('\n🎉 Database seeding completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function clearDatabase() {
  const client = await pool.connect();
  try {
    console.log('🗑️  Clearing database...');
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const tables = [
      'trip_stops', 'vehicle_locations', 'trips', 'alerts', 
      'route_stops', 'vehicles', 'drivers', 'bus_stops', 
      'routes', 'passenger_requests', 'users'
    ];
    for (const table of tables) {
      await client.query(`DELETE FROM ${table}`);
      console.log(`   ✅ Cleared ${table}`);
    }
    await client.query('COMMIT');
    console.log('✅ Database cleared successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Clear failed:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

const command = process.argv[2];
(async function main() {
  try {
    switch (command) {
      case 'clear':
        await clearDatabase();
        break;
      default:
        await seedDatabase();
        break;
    }
  } catch (error) {
    console.error('Script failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();


