const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const router = express.Router();
const {
  generateToken,
  authenticateToken,
  authorizeRoles,
  authLimiter,
  loginValidation,
  registerDriverValidation,
  handleValidationErrors,
  hashPassword,
  comparePassword
} = require('../middleware/auth');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

router.post('/login', 
  authLimiter,
  loginValidation,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const userQuery = `
        SELECT id, email, password_hash, role, name, is_active, created_at
        FROM users 
        WHERE email = $1 AND is_active = true
      `;
      const userResult = await pool.query(userQuery, [email]);
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }
      const user = userResult.rows[0];
      const isPasswordValid = await comparePassword(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      }
      const tokenPayload = { userId: user.id, email: user.email, role: user.role, name: user.name };
      const token = generateToken(tokenPayload);
      const refreshToken = generateToken(tokenPayload, '7d');
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
      logger.info(`User login successful`, { userId: user.id, email: user.email, role: user.role, ip: req.ip });
      res.json({
        message: 'Login successful',
        user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.created_at },
        token,
        refreshToken
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
    }
  }
);

router.post('/register-driver',
  authenticateToken,
  authorizeRoles('admin'),
  registerDriverValidation,
  handleValidationErrors,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { email, password, name, phone, licenseNumber } = req.body;
      const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(409).json({ error: 'User already exists', code: 'USER_EXISTS' });
      }
      const passwordHash = await hashPassword(password);
      const userQuery = `
        INSERT INTO users (email, password_hash, role, name, phone, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        RETURNING id, email, name, role, created_at
      `;
      const userResult = await client.query(userQuery, [email, passwordHash, 'driver', name, phone]);
      const newUser = userResult.rows[0];
      const driverQuery = `
        INSERT INTO drivers (user_id, license_number, status, created_at)
        VALUES ($1, $2, 'inactive', NOW())
        RETURNING id
      `;
      const driverResult = await client.query(driverQuery, [newUser.id, licenseNumber]);
      await client.query('COMMIT');
      logger.info(`Driver registered successfully`, { userId: newUser.id, email: newUser.email, registeredBy: req.user.userId });
      res.status(201).json({
        message: 'Driver registered successfully',
        user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, driverId: driverResult.rows[0].id, createdAt: newUser.created_at }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Driver registration error:', error);
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Email or license number already exists', code: 'DUPLICATE_ERROR' });
      }
      res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
    } finally {
      client.release();
    }
  }
);

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required', code: 'MISSING_REFRESH_TOKEN' });
    }
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const newToken = generateToken({ userId: decoded.userId, email: decoded.email, role: decoded.role, name: decoded.name });
    res.json({ message: 'Token refreshed', token: newToken });
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(403).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH_TOKEN' });
  }
});

router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userQuery = `
      SELECT u.id, u.email, u.name, u.role, u.phone, u.created_at, u.last_login,
             d.id as driver_id, d.license_number, d.status as driver_status,
             v.id as assigned_vehicle_id, v.registration_number
      FROM users u
      LEFT JOIN drivers d ON u.id = d.user_id
      LEFT JOIN vehicles v ON d.id = v.assigned_driver_id
      WHERE u.id = $1
    `;
    const result = await pool.query(userQuery, [req.user.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    const user = result.rows[0];
    const profile = { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, createdAt: user.created_at, lastLogin: user.last_login };
    if (user.role === 'driver') {
      profile.driver = { id: user.driver_id, licenseNumber: user.license_number, status: user.driver_status, assignedVehicle: user.assigned_vehicle_id ? { id: user.assigned_vehicle_id, registrationNumber: user.registration_number } : null };
    }
    res.json({ message: 'Profile retrieved successfully', profile });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error', code: 'SERVER_ERROR' });
  }
});

router.post('/logout', authenticateToken, (req, res) => {
  logger.info(`User logout`, { userId: req.user.userId, email: req.user.email });
  res.json({ message: 'Logout successful' });
});

module.exports = router;

