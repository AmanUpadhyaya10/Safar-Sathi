const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, u.email, u.name, u.phone, d.license_number, d.status, d.total_trips
       FROM drivers d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC`
    );
    res.json({ drivers: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

module.exports = router;

