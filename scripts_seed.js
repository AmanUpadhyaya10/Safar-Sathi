// scripts/seed.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seedDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🌱 Starting database seeding...');
    
    await client.query('BEGIN');
    
    // 1. Create admin user if not exists
    console.log('👤 Creating admin user...');
    const adminPassword = await bcrypt.hash('admin123', 12);
    
    await client.query(`
      INSERT INTO users (email, password_hash, role, name, phone, is_active)
      VALUES ($1, $2, 'admin', 'System Administrator', '+91-9999999999', true)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = $2,
        updated_at = NOW()
    `, ['admin@safarsathi.com', adminPassword]);
    
    console.log('✅ Admin user created/updated: admin@safarsathi.com / admin123');
    
    // 2. Create sample routes
    console.log('🛣️  Creating sample routes...');
    
    const routes = [
      {
        name: 'Route 1: City Center - Airport',
        description: 'Main route connecting city center to Jolly Grant Airport',
        color: '#E53E3E'
      },
      {
        name: 'Route 2: ISBT - University',
        description: 'Inter State Bus Terminal to University route',
        color: '#3182CE'
      },
      {
        name: 'Route 3: Clock Tower - Hospital',
        description: 'Clock Tower to General Hospital via main roads',
        color: '#38A169'
      },
      {
        name: 'Route 4: Paltan Bazaar Circle',
        description: 'Circular route covering Paltan Bazaar area',
        color: '#9F7AEA'
      }
    ];
    
    const routeIds = [];
    for (const route of routes) {
      const result = await client.query(`
        INSERT INTO routes (name, description, color, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [route.name, route.description, route.color]);
      
      if (result.rows.length > 0) {
        routeIds.push(result.rows[0].id);
        console.log(`   ✅ ${route.name}`);
      } else {
        // Get existing route ID
        const existing = await client.query(
          'SELECT id FROM routes WHERE name = $1',
          [route.name]
        );
        if (existing.rows.length > 0) {
          routeIds.push(existing.rows[0].id);
        }
      }
    }
    
    // 3. Create bus stops (Dehradun locations)
    console.log('🚏 Creating bus stops...');
    
    const busStops = [
      {
        name: 'City Center',
        lat: 30.3165,
        lng: 78.0322,
        address: 'Main City Center, Dehradun, Uttarakhand',
        amenities: ['shelter', 'bench', 'digital_display']
      },
      {
        name: 'Clock Tower',
        lat: 30.3204,
        lng: 78.0348,
        address: 'Clock Tower, Dehradun, Uttarakhand',
        amenities: ['shelter', 'bench']
      },
      {
        name: 'ISBT Dehradun',
        lat: 30.3254,
        lng: 78.0423,
        address: 'Inter State Bus Terminal, Dehradun',
        amenities: ['shelter', 'bench', 'ticket_counter', 'waiting_room']
      },
      {
        name: 'Jolly Grant Airport',
        lat: 30.1872,
        lng: 78.1802,
        address: 'Jolly Grant Airport, Dehradun',
        amenities: ['shelter', 'bench', 'digital_display', 'taxi_stand']
      },
      {
        name: 'DIT University',
        lat: 30.4092,
        lng: 78.0775,
        address: 'DIT University, Mussoorie Road, Dehradun',
        amenities: ['shelter', 'bench']
      },
      {
        name: 'Paltan Bazaar',
        lat: 30.3250,
        lng: 78.0367,
        address: 'Paltan Bazaar, Dehradun',
        amenities: ['shelter', 'bench', 'shops']
      },
      {
        name: 'General Hospital',
        lat: 30.3190,
        lng: 78.0290,
        address: 'Coronation Hospital, Dehradun',
        amenities: ['shelter', 'bench', 'medical_facilities']
      },
      {
        name: 'Railway Station',
        lat: 30.3374,
        lng: 78.0419,
        address: 'Dehradun Railway Station',
        amenities: ['shelter', 'bench', 'digital_display', 'ticket_counter']
      }
    ];
    
    const stopIds = [];
    for (const stop of busStops) {
      const result = await client.query(`
        INSERT INTO bus_stops (name, location, address, amenities, is_active)
        VALUES ($1, ST_GeogFromText($2), $3, $4, true)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [
        stop.name,
        `POINT(${stop.lng} ${stop.lat})`,
        stop.address,
        stop.amenities
      ]);
      
      if (result.rows.length > 0) {
        stopIds.push({ id: result.rows[0].id, name: stop.name });
        console.log(`   ✅ ${stop.name}`);
      } else {
        // Get existing stop ID
        const existing = await client.query(
          'SELECT id FROM bus_stops WHERE name = $1',
          [stop.name]
        );
        if (existing.rows.length > 0) {
          stopIds.push({ id: existing.rows[0].id, name: stop.name });
        }
      }
    }
    
    // 4. Create route-stop associations
    console.log('🔗 Linking routes and stops...');
    
    // Route 1: City Center - Airport
    if (routeIds.length > 0 && stopIds.length >= 4) {
      const route1Stops = [
        { stopName: 'City Center', order: 1, travelTime: 0 },
        { stopName: 'Clock Tower', order: 2, travelTime: 300 },
        { stopName: 'ISBT Dehradun', order: 3, travelTime: 600 },
        { stopName: 'Jolly Grant Airport', order: 4, travelTime: 2400 }
      ];
      
      for (const routeStop of route1Stops) {
        const stop = stopIds.find(s => s.name === routeStop.stopName);
        if (stop) {
          await client.query(`
            INSERT INTO route_stops (route_id, bus_stop_id, stop_order, estimated_travel_time)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (route_id, bus_stop_id) DO NOTHING
          `, [routeIds[0], stop.id, routeStop.order, routeStop.travelTime]);
        }
      }
      console.log('   ✅ Route 1 stops linked');
      
      // Route 2: ISBT - University
      if (routeIds.length > 1) {
        const route2Stops = [
          { stopName: 'ISBT Dehradun', order: 1, travelTime: 0 },
          { stopName: 'Paltan Bazaar', order: 2, travelTime: 480 },
          { stopName: 'Clock Tower', order: 3, travelTime: 300 },
          { stopName: 'DIT University', order: 4, travelTime: 1200 }
        ];
        
        for (const routeStop of route2Stops) {
          const stop = stopIds.find(s => s.name === routeStop.stopName);
          if (stop) {
            await client.query(`
              INSERT INTO route_stops (route_id, bus_stop_id, stop_order, estimated_travel_time)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (route_id, bus_stop_id) DO NOTHING
            `, [routeIds[1], stop.id, routeStop.order, routeStop.travelTime]);
          }
        }
        console.log('   ✅ Route 2 stops linked');
      }
    }
    
    // 5. Create sample drivers
    console.log('👨‍✈️ Creating sample drivers...');
    
    const drivers = [
      {
        email: 'driver1@safarsathi.com',
        password: 'driver123',
        name: 'Rajesh Kumar',
        phone: '+91-9876543210',
        license: 'DL-UK-2019-0001234'
      },
      {
        email: 'driver2@safarsathi.com',
        password: 'driver123',
        name: 'Amit Singh',
        phone: '+91-9876543211',
        license: 'DL-UK-2020-0005678'
      },
      {
        email: 'driver3@safarsathi.com',
        password: 'driver123',
        name: 'Suresh Sharma',
        phone: '+91-9876543212',
        license: 'DL-UK-2021-0009012'
      }
    ];
    
    const driverIds = [];
    for (const driver of drivers) {
      const hashedPassword = await bcrypt.hash(driver.password, 12);
      
      // Create user
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, role, name, phone, is_active)
        VALUES ($1, $2, 'driver', $3, $4, true)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = $2,
          updated_at = NOW()
        RETURNING id
      `, [driver.email, hashedPassword, driver.name, driver.phone]);
      
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        
        // Create driver profile
        const driverResult = await client.query(`
          INSERT INTO drivers (user_id, license_number, status)
          VALUES ($1, $2, 'active')
          ON CONFLICT (license_number) DO UPDATE SET
            status = 'active',
            updated_at = NOW()
          RETURNING id
        `, [userId, driver.license]);
        
        if (driverResult.rows.length > 0) {
          driverIds.push(driverResult.rows[0].id);
          console.log(`   ✅ ${driver.name} (${driver.email})`);
        }
      }
    }
    
    // 6. Create sample vehicles
    console.log('🚌 Creating sample vehicles...');
    
    const vehicles = [
      {
        registration: 'UK-05-AA-1234',
        model: 'Tata Starbus',
        capacity: 40,
        fuel: 'diesel'
      },
      {
        registration: 'UK-05-BB-5678',
        model: 'Ashok Leyland Viking',
        capacity: 45,
        fuel: 'cng'
      },
      {
        registration: 'UK-05-CC-9012',
        model: 'Mahindra Tourister',
        capacity: 35,
        fuel: 'diesel'
      }
    ];
    
    for (let i = 0; i < vehicles.length; i++) {
      const vehicle = vehicles[i];
      const assignedDriverId = driverIds[i] || null;
      const assignedRouteId = routeIds[i] || null;
      
      await client.query(`
        INSERT INTO vehicles (registration_number, model, capacity, fuel_type, assigned_driver_id, assigned_route_id, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
        ON CONFLICT (registration_number) DO UPDATE SET
          model = $2,
          capacity = $3,
          assigned_driver_id = $5,
          assigned_route_id = $6,
          updated_at = NOW()
      `, [vehicle.registration, vehicle.model, vehicle.capacity, vehicle.fuel, assignedDriverId, assignedRouteId]);
      
      console.log(`   ✅ ${vehicle.registration} (${vehicle.model})`);
    }
    
    // 7. Create sample alerts
    console.log('🚨 Creating sample alerts...');
    
    const adminUser = await client.query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
    if (adminUser.rows.length > 0) {
      const adminId = adminUser.rows[0].id;
      
      await client.query(`
        INSERT INTO alerts (type, title, message, severity, created_by, is_active, expires_at)
        VALUES 
          ('info', 'Welcome to Safar Sathi', 'Public transport tracking system is now live!', 'info', $1, true, NOW() + INTERVAL '30 days'),
          ('warning', 'Route 1 Delay', 'Route 1 services experiencing 10-minute delays due to traffic', 'warning', $1, true, NOW() + INTERVAL '2 hours')
        ON CONFLICT DO NOTHING
      `, [adminId]);
      
      console.log('   ✅ Sample alerts created');
    }
    
    await client.query('COMMIT');
    
    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   👤 Admin: admin@safarsathi.com / admin123`);
    console.log(`   👨‍✈️ Drivers: driver1@safarsathi.com / driver123 (and 2 more)`);
    console.log(`   🛣️  Routes: ${routes.length} routes created`);
    console.log(`   🚏 Bus Stops: ${busStops.length} stops created`);
    console.log(`   🚌 Vehicles: ${vehicles.length} vehicles created`);
    
    console.log('\n🔗 You can now:');
    console.log('   1. Login as admin to manage the system');
    console.log('   2. Login as driver to start tracking');
    console.log('   3. View real-time bus locations on maps');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function clearDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🗑️  Clearing database...');
    
    const confirmText = 'DELETE_ALL_DATA';
    const userInput = process.argv[3];
    
    if (userInput !== confirmText) {
      console.log(`⚠️  To clear all data, run: npm run seed clear ${confirmText}`);
      return;
    }
    
    await client.query('BEGIN');
    
    // Disable foreign key checks temporarily
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
    
    // Reset sequences
    await client.query(`
      SELECT setval(pg_get_serial_sequence('users', 'id'), 1, false);
    `);
    
    await client.query('COMMIT');
    console.log('✅ Database cleared successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Clear failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Command line interface
const command = process.argv[2];

async function main() {
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
}

main();