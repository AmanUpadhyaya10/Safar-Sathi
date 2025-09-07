// scripts/migrate.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting database migrations...');
    
    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    // Get list of migration files
    const migrationsDir = path.join(__dirname, '../migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      console.log('📁 Created migrations directory');
    }
    
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (migrationFiles.length === 0) {
      console.log('⚠️  No migration files found');
      return;
    }
    
    // Check which migrations have already been executed
    const executedMigrationsResult = await client.query('SELECT filename FROM migrations');
    const executedMigrations = new Set(
      executedMigrationsResult.rows.map(row => row.filename)
    );
    
    let migrationsRun = 0;
    
    for (const filename of migrationFiles) {
      if (executedMigrations.has(filename)) {
        console.log(`⏩ Skipping already executed migration: ${filename}`);
        continue;
      }
      
      console.log(`🔄 Running migration: ${filename}`);
      
      const migrationPath = path.join(migrationsDir, filename);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      // Split SQL file by statements (simple approach)
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);
      
      await client.query('BEGIN');
      
      try {
        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }
        
        // Record migration as executed
        await client.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );
        
        await client.query('COMMIT');
        console.log(`✅ Migration completed: ${filename}`);
        migrationsRun++;
        
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Migration failed: ${filename}`);
        console.error('Error:', error.message);
        throw error;
      }
    }
    
    if (migrationsRun > 0) {
      console.log(`🎉 Successfully ran ${migrationsRun} migrations`);
    } else {
      console.log('✅ All migrations are up to date');
    }
    
    // Test database connection and extensions
    console.log('\n🔍 Testing database setup...');
    
    const postgisTest = await client.query(`
      SELECT PostGIS_Version() as version
    `);
    console.log(`✅ PostGIS version: ${postgisTest.rows[0].version}`);
    
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('✅ Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
    // Check if admin user exists
    const adminCheck = await client.query(`
      SELECT email, name, role FROM users WHERE role = 'admin' LIMIT 1
    `);
    
    if (adminCheck.rows.length > 0) {
      console.log(`✅ Admin user: ${adminCheck.rows[0].email} (${adminCheck.rows[0].name})`);
    } else {
      console.log('⚠️  No admin user found');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

async function rollbackLastMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Rolling back last migration...');
    
    const lastMigrationResult = await client.query(`
      SELECT filename FROM migrations 
      ORDER BY executed_at DESC 
      LIMIT 1
    `);
    
    if (lastMigrationResult.rows.length === 0) {
      console.log('⚠️  No migrations to rollback');
      return;
    }
    
    const filename = lastMigrationResult.rows[0].filename;
    console.log(`🔄 Rolling back: ${filename}`);
    
    // Check for rollback file
    const rollbackFilename = filename.replace('.sql', '_rollback.sql');
    const rollbackPath = path.join(__dirname, '../migrations', rollbackFilename);
    
    if (fs.existsSync(rollbackPath)) {
      const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');
      const statements = rollbackSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);
      
      await client.query('BEGIN');
      
      try {
        for (const statement of statements) {
          if (statement.trim()) {
            await client.query(statement);
          }
        }
        
        // Remove migration record
        await client.query(
          'DELETE FROM migrations WHERE filename = $1',
          [filename]
        );
        
        await client.query('COMMIT');
        console.log(`✅ Rollback completed: ${filename}`);
        
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Rollback failed: ${filename}`);
        throw error;
      }
    } else {
      console.log(`⚠️  No rollback file found: ${rollbackFilename}`);
      console.log('   Manual cleanup may be required');
    }
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Command line interface
const command = process.argv[2];

switch (command) {
  case 'rollback':
    rollbackLastMigration();
    break;
  case 'up':
  default:
    runMigrations();
    break;
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Migration interrupted');
  await pool.end();
  process.exit(0);
});