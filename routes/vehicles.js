const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const router = express.Router();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, registration_number, model, capacity, status, assigned_driver_id, assigned_route_id FROM vehicles ORDER BY created_at DESC');
    res.json({ vehicles: result.rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicles' });
  }
});

router.post('/', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { registrationNumber, model, capacity, fuelType, assignedDriverId, assignedRouteId } = req.body;
    const result = await pool.query(
      `INSERT INTO vehicles (registration_number, model, capacity, fuel_type, assigned_driver_id, assigned_route_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING *`,
      [registrationNumber, model, capacity || 40, fuelType || 'diesel', assignedDriverId || null, assignedRouteId || null]
    );
    res.status(201).json({ vehicle: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create vehicle' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vehicles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ vehicle: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vehicle' });
  }
});

router.put('/:id', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const { model, capacity, fuelType, status, assignedDriverId, assignedRouteId } = req.body;
    const result = await pool.query(
      `UPDATE vehicles SET model = COALESCE($2, model), capacity = COALESCE($3, capacity), fuel_type = COALESCE($4, fuel_type),
       status = COALESCE($5, status), assigned_driver_id = COALESCE($6, assigned_driver_id), assigned_route_id = COALESCE($7, assigned_route_id), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, model, capacity, fuelType, status, assignedDriverId, assignedRouteId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vehicle not found' });
    res.json({ vehicle: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update vehicle' });
  }
});

module.exports = router;

