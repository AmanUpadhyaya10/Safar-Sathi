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
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
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
    const executedMigrationsResult = await client.query('SELECT filename FROM migrations');
    const executedMigrations = new Set(executedMigrationsResult.rows.map(row => row.filename));
    let migrationsRun = 0;
    for (const filename of migrationFiles) {
      if (executedMigrations.has(filename)) {
        console.log(`⏩ Skipping already executed migration: ${filename}`);
        continue;
      }
      console.log(`🔄 Running migration: ${filename}`);
      const migrationPath = path.join(migrationsDir, filename);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      const statements = migrationSQL.split(';').map(s => s.trim()).filter(Boolean);
      await client.query('BEGIN');
      try {
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query('INSERT INTO migrations (filename) VALUES ($1)', [filename]);
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
    console.log('\n🔍 Testing database setup...');
    try {
      const postgisTest = await client.query('SELECT PostGIS_Version() as version');
      console.log(`✅ PostGIS version: ${postgisTest.rows[0].version}`);
    } catch (_) {
      console.log('⚠️  PostGIS version check failed (extension may not be enabled yet).');
    }
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log('✅ Tables created:');
    tablesResult.rows.forEach(row => console.log(`   - ${row.table_name}`));
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
    const rollbackFilename = filename.replace('.sql', '_rollback.sql');
    const rollbackPath = path.join(__dirname, '../migrations', rollbackFilename);
    if (fs.existsSync(rollbackPath)) {
      const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');
      const statements = rollbackSQL.split(';').map(s => s.trim()).filter(Boolean);
      await client.query('BEGIN');
      try {
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query('DELETE FROM migrations WHERE filename = $1', [filename]);
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

process.on('SIGINT', async () => {
  console.log('\n🛑 Migration interrupted');
  await pool.end();
  process.exit(0);
});


