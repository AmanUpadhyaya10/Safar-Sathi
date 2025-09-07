const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, v.registration_number, r.name as route_name
       FROM trips t
       JOIN vehicles v ON t.vehicle_id = v.id
       JOIN routes r ON t.route_id = r.id
       ORDER BY t.created_at DESC`
    );
    res.json({ trips: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { vehicleId, driverId, routeId, direction, scheduledStartTime } = req.body;
    const result = await pool.query(
      `INSERT INTO trips (vehicle_id, driver_id, route_id, direction, scheduled_start_time, status)
       VALUES ($1, $2, $3, $4, $5, 'scheduled') RETURNING *`,
      [vehicleId, driverId, routeId, direction || 'forward', scheduledStartTime]
    );
    res.status(201).json({ trip: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM trips WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    res.json({ trip: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trip' });
  }
});

module.exports = router;

