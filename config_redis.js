// config/redis.js
const Redis = require('ioredis');
const logger = require('../utils/logger').logger;

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Connection pool settings
  family: 4,
  keepAlive: true,
  // Reconnection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryCount: 5,
  retryDelayOnClusterDown: 300,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3
};

// Create Redis client for general use
const redis = new Redis(redisConfig);

// Create Redis client for pub/sub
const redisPub = new Redis(redisConfig);
const redisSub = new Redis(redisConfig);

// Redis event handlers
redis.on('connect', () => {
  logger.info('Redis client connected');
});

redis.on('ready', () => {
  logger.info('Redis client ready');
});

redis.on('error', (err) => {
  logger.error('Redis client error:', err);
});

redis.on('close', () => {
  logger.warn('Redis client connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis client reconnecting...');
});

// Pub/Sub event handlers
redisPub.on('error', (err) => {
  logger.error('Redis pub client error:', err);
});

redisSub.on('error', (err) => {
  logger.error('Redis sub client error:', err);
});

// Redis utility functions
const redisUtils = {
  // Cache vehicle location
  async cacheVehicleLocation(vehicleId, locationData, ttl = 300) {
    const key = `vehicle:location:${vehicleId}`;
    try {
      await redis.setex(key, ttl, JSON.stringify(locationData));
    } catch (error) {
      logger.error('Error caching vehicle location:', error);
    }
  },

  // Get cached vehicle location
  async getCachedVehicleLocation(vehicleId) {
    const key = `vehicle:location:${vehicleId}`;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting cached vehicle location:', error);
      return null;
    }
  },

  // Cache ETA calculation
  async cacheETA(routeId, stopId, vehicleId, eta, ttl = 60) {
    const key = `eta:${routeId}:${stopId}:${vehicleId}`;
    try {
      await redis.setex(key, ttl, JSON.stringify(eta));
    } catch (error) {
      logger.error('Error caching ETA:', error);
    }
  },

  // Get cached ETA
  async getCachedETA(routeId, stopId, vehicleId) {
    const key = `eta:${routeId}:${stopId}:${vehicleId}`;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting cached ETA:', error);
      return null;
    }
  },

  // Cache route data
  async cacheRoute(routeId, routeData, ttl = 3600) {
    const key = `route:${routeId}`;
    try {
      await redis.setex(key, ttl, JSON.stringify(routeData));
    } catch (error) {
      logger.error('Error caching route data:', error);
    }
  },

  // Get cached route
  async getCachedRoute(routeId) {
    const key = `route:${routeId}`;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting cached route:', error);
      return null;
    }
  },

  // Store active trip data
  async setActiveTripData(tripId, tripData, ttl = 86400) {
    const key = `trip:active:${tripId}`;
    try {
      await redis.setex(key, ttl, JSON.stringify(tripData));
    } catch (error) {
      logger.error('Error setting active trip data:', error);
    }
  },

  // Get active trip data
  async getActiveTripData(tripId) {
    const key = `trip:active:${tripId}`;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting active trip data:', error);
      return null;
    }
  },

  // Store driver session
  async setDriverSession(driverId, sessionData, ttl = 86400) {
    const key = `driver:session:${driverId}`;
    try {
      await redis.setex(key, ttl, JSON.stringify(sessionData));
    } catch (error) {
      logger.error('Error setting driver session:', error);
    }
  },

  // Get driver session
  async getDriverSession(driverId) {
    const key = `driver:session:${driverId}`;
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting driver session:', error);
      return null;
    }
  },

  // Remove driver session
  async removeDriverSession(driverId) {
    const key = `driver:session:${driverId}`;
    try {
      await redis.del(key);
    } catch (error) {
      logger.error('Error removing driver session:', error);
    }
  },

  // Publish location update
  async publishLocationUpdate(vehicleId, locationData) {
    const channel = `location:${vehicleId}`;
    try {
      await redisPub.publish(channel, JSON.stringify(locationData));
      // Also publish to general channel for dashboard
      await redisPub.publish('location:all', JSON.stringify({
        vehicleId,
        ...locationData
      }));
    } catch (error) {
      logger.error('Error publishing location update:', error);
    }
  },

  // Subscribe to location updates
  async subscribeToLocationUpdates(vehicleId, callback) {
    const channel = `location:${vehicleId}`;
    try {
      await redisSub.subscribe(channel);
      redisSub.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          callback(JSON.parse(message));
        }
      });
    } catch (error) {
      logger.error('Error subscribing to location updates:', error);
    }
  },

  // Subscribe to all location updates
  async subscribeToAllLocationUpdates(callback) {
    const channel = 'location:all';
    try {
      await redisSub.subscribe(channel);
      redisSub.on('message', (receivedChannel, message) => {
        if (receivedChannel === channel) {
          callback(JSON.parse(message));
        }
      });
    } catch (error) {
      logger.error('Error subscribing to all location updates:', error);
    }
  },

  // Rate limiting
  async checkRateLimit(identifier, limit = 100, window = 3600) {
    const key = `rate_limit:${identifier}`;
    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, window);
      }
      return {
        allowed: current <= limit,
        current,
        limit,
        remaining: Math.max(0, limit - current)
      };
    } catch (error) {
      logger.error('Error checking rate limit:', error);
      return { allowed: true, current: 0, limit, remaining: limit };
    }
  }
};

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Closing Redis connections...');
  try {
    await redis.quit();
    await redisPub.quit();
    await redisSub.quit();
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error('Error closing Redis connections:', error);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = {
  redis,
  redisPub,
  redisSub,
  redisUtils
};