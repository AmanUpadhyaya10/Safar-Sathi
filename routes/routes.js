const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, description, color, is_active FROM routes ORDER BY created_at DESC');
    res.json({ routes: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch routes' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const result = await pool.query(
      `INSERT INTO routes (name, description, color, is_active) VALUES ($1, $2, $3, true) RETURNING *`,
      [name, description || null, color || '#3B82F6']
    );
    res.status(201).json({ route: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create route' });
  }
});

router.get('/:id/stops', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bs.id, bs.name, ST_X(bs.location::geometry) as longitude, ST_Y(bs.location::geometry) as latitude, rs.stop_order
       FROM route_stops rs
       JOIN bus_stops bs ON rs.bus_stop_id = bs.id
       WHERE rs.route_id = $1
       ORDER BY rs.stop_order`,
      [req.params.id]
    );
    res.json({ stops: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stops' });
  }
});

module.exports = router;

