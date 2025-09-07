// app.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import utilities and middleware
const { logger, morganMiddleware } = require('./utils/logger');
const { generalLimiter } = require('./middleware/auth');
const { redis, redisPub, redisSub, redisUtils } = require('./config/redis');

// Import socket handlers
const { setupLocationSocket } = require('./sockets/locationSocket');

// Import routes
const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const tripRoutes = require('./routes/trips');
const routeRoutes = require('./routes/routes');
const driverRoutes = require('./routes/drivers');

const app = express();
const server = http.createServer(app);

// Socket.IO setup with Redis adapter
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
});

// Configure Redis adapter
const { createAdapter } = require('@socket.io/redis-adapter');
io.adapter(createAdapter(redisPub, redisSub));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws://localhost:*", "wss://*"]
    }
  }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(compression());
app.use(morganMiddleware);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/', generalLimiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    await pool.query('SELECT 1');
    
    // Check Redis connection
    await redis.ping();
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        socketio: 'running'
      }
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/drivers', driverRoutes);
// Realtime API (cached data)
app.get('/api/realtime/vehicles/:id/location', async (req, res) => {
  try {
    const cached = await redisUtils.getCachedVehicleLocation(req.params.id);
    if (!cached) return res.status(404).json({ error: 'No cached location for vehicle' });
    res.json({ vehicleId: Number(req.params.id), location: cached });
  } catch (error) {
    logger.error('Realtime location fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch realtime location' });
  }
});

app.get('/api/realtime/trips/:id/etas', async (req, res) => {
  try {
    // For simplicity, return last few cached ETAs by scanning stops 1..5
    // In production, store an index of stops per trip/route in Redis for efficient listing
    const active = await redisUtils.getActiveTripData(req.params.id);
    if (!active) return res.status(404).json({ error: 'Trip not active' });
    const { route_id: routeId, vehicle_id: vehicleId } = active;
    const stopIds = (active.nextStopIds || []).slice(0, 10);
    const etas = [];
    for (const stopId of stopIds) {
      const eta = await redisUtils.getCachedETA(routeId, stopId, vehicleId);
      if (eta) etas.push({ stopId, ...eta });
    }
    res.json({ tripId: Number(req.params.id), etas });
  } catch (error) {
    logger.error('Realtime ETAs fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch ETAs' });
  }
});

// Static files (for PWA)
app.use(express.static('public'));

// Setup Socket.IO handlers
setupLocationSocket(io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    error: isDevelopment ? error.message : 'Internal server error',
    code: 'SERVER_ERROR',
    ...(isDevelopment && { stack: error.stack })
  });
});

// Server startup
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`🚌 Safar Sathi server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    process.exit(0);
  });
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = { app, io };