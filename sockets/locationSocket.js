const { Pool } = require('pg');
const { authenticateSocket } = require('../middleware/auth');
const { redisUtils } = require('../config/redis');
const { logger } = require('../utils/logger');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const setupLocationSocket = (io) => {
  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId} (${socket.userRole})`);
    if (socket.userRole === 'driver') handleDriverConnection(socket);
    if (socket.userRole === 'passenger' || socket.userRole === 'admin') handlePassengerConnection(socket);
    socket.on('disconnect', () => { handleDisconnection(socket); });
  });
};

const handleDriverConnection = async (socket) => {
  try {
    const driverQuery = `
      SELECT d.id as driver_id, d.status, v.id as vehicle_id, v.registration_number,
             t.id as trip_id, t.route_id, t.status as trip_status
      FROM drivers d
      LEFT JOIN vehicles v ON d.id = v.assigned_driver_id
      LEFT JOIN trips t ON v.id = t.vehicle_id AND t.status = 'active'
      WHERE d.user_id = $1
    `;
    const result = await pool.query(driverQuery, [socket.userId]);
    if (result.rows.length === 0) { socket.emit('error', { message: 'Driver profile not found' }); return; }
    const driverData = result.rows[0];
    socket.driverId = driverData.driver_id;
    socket.vehicleId = driverData.vehicle_id;
    socket.tripId = driverData.trip_id;
    if (socket.vehicleId) socket.join(`vehicle:${socket.vehicleId}`);
    await redisUtils.setDriverSession(socket.driverId, { socketId: socket.id, vehicleId: socket.vehicleId, tripId: socket.tripId, status: 'connected', connectedAt: new Date().toISOString() });
    socket.emit('driver_status', { driverId: driverData.driver_id, vehicleId: driverData.vehicle_id, registrationNumber: driverData.registration_number, tripId: driverData.trip_id, tripStatus: driverData.trip_status, status: driverData.status });
    socket.on('location_update', async (locationData) => { await handleLocationUpdate(socket, locationData); });
    socket.on('start_trip', async (tripData) => { await handleTripStart(socket, tripData); });
    socket.on('end_trip', async (tripData) => { await handleTripEnd(socket, tripData); });
    socket.on('passenger_count_update', async (countData) => { await handlePassengerCountUpdate(socket, countData); });
    logger.info(`Driver connected: ${socket.driverId}, Vehicle: ${socket.vehicleId}`);
  } catch (error) {
    logger.error('Error handling driver connection:', error);
    socket.emit('error', { message: 'Connection failed' });
  }
};

const handlePassengerConnection = async (socket) => {
  socket.join('passengers');
  if (socket.userRole === 'admin') socket.join('admin');
  socket.on('subscribe_route', (routeId) => { socket.join(`route:${routeId}`); logger.info(`User ${socket.userId} subscribed to route ${routeId}`); });
  socket.on('subscribe_vehicle', (vehicleId) => { socket.join(`vehicle:${vehicleId}`); logger.info(`User ${socket.userId} subscribed to vehicle ${vehicleId}`); });
  socket.on('unsubscribe_route', (routeId) => { socket.leave(`route:${routeId}`); });
  socket.on('unsubscribe_vehicle', (vehicleId) => { socket.leave(`vehicle:${vehicleId}`); });
  logger.info(`${socket.userRole} connected: ${socket.userId}`);
};

const handleLocationUpdate = async (socket, locationData) => {
  try {
    const { latitude, longitude, speed, heading, accuracy, timestamp } = locationData;
    if (!latitude || !longitude) { socket.emit('error', { message: 'Invalid location data' }); return; }
    if (!socket.vehicleId) { socket.emit('error', { message: 'No vehicle assigned' }); return; }
    const locationQuery = `
      INSERT INTO vehicle_locations (vehicle_id, trip_id, location, speed, heading, accuracy, timestamp)
      VALUES ($1, $2, ST_GeogFromText($3), $4, $5, $6, $7)
      RETURNING id
    `;
    const locationPoint = `POINT(${longitude} ${latitude})`;
    await pool.query(locationQuery, [socket.vehicleId, socket.tripId, locationPoint, speed || null, heading || null, accuracy || null, timestamp ? new Date(timestamp) : new Date()]);
    const cacheData = { vehicleId: socket.vehicleId, tripId: socket.tripId, latitude, longitude, speed, heading, accuracy, timestamp: timestamp || new Date().toISOString(), driverId: socket.driverId };
    await redisUtils.cacheVehicleLocation(socket.vehicleId, cacheData);
    await redisUtils.publishLocationUpdate(socket.vehicleId, cacheData);
    socket.to(`vehicle:${socket.vehicleId}`).emit('location_update', cacheData);
    if (socket.tripId) {
      const routeQuery = 'SELECT route_id FROM trips WHERE id = $1';
      const routeResult = await pool.query(routeQuery, [socket.tripId]);
      if (routeResult.rows.length > 0) {
        const routeId = routeResult.rows[0].route_id;
        socket.to(`route:${routeId}`).emit('route_vehicle_update', { routeId, vehicleId: socket.vehicleId, ...cacheData });
      }
    }
    socket.to('admin').emit('vehicle_location_update', cacheData);
    await calculateAndEmitETAs(socket, { latitude, longitude });
  } catch (error) {
    logger.error('Error handling location update:', error);
    socket.emit('error', { message: 'Failed to update location' });
  }
};

const handleTripStart = async (socket) => {
  try {
    if (!socket.tripId) { socket.emit('error', { message: 'No active trip found' }); return; }
    const updateQuery = `
      UPDATE trips 
      SET status = 'active', actual_start_time = NOW()
      WHERE id = $1 AND driver_id = $2
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [socket.tripId, socket.driverId]);
    if (result.rows.length === 0) { socket.emit('error', { message: 'Failed to start trip' }); return; }
    const trip = result.rows[0];
    await redisUtils.setActiveTripData(socket.tripId, { ...trip, startedAt: new Date().toISOString() });
    socket.emit('trip_started', { tripId: socket.tripId, startTime: trip.actual_start_time });
    socket.to(`route:${trip.route_id}`).emit('trip_status_update', { tripId: socket.tripId, vehicleId: socket.vehicleId, status: 'active', startTime: trip.actual_start_time });
    logger.info(`Trip started: ${socket.tripId} by driver: ${socket.driverId}`);
  } catch (error) {
    logger.error('Error starting trip:', error);
    socket.emit('error', { message: 'Failed to start trip' });
  }
};

const handleTripEnd = async (socket, tripData) => {
  try {
    if (!socket.tripId) { socket.emit('error', { message: 'No active trip found' }); return; }
    const { passengerCount, distanceCovered } = tripData;
    const updateQuery = `
      UPDATE trips 
      SET status = 'completed', actual_end_time = NOW(), 
          passenger_count = $3, distance_covered = $4
      WHERE id = $1 AND driver_id = $2
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [socket.tripId, socket.driverId, passengerCount || 0, distanceCovered || 0]);
    if (result.rows.length === 0) { socket.emit('error', { message: 'Failed to end trip' }); return; }
    const trip = result.rows[0];
    await redisUtils.removeDriverSession(socket.driverId);
    await pool.query('UPDATE drivers SET total_trips = total_trips + 1 WHERE id = $1', [socket.driverId]);
    socket.emit('trip_ended', { tripId: socket.tripId, endTime: trip.actual_end_time, stats: { passengerCount: trip.passenger_count, distanceCovered: trip.distance_covered } });
    socket.to(`route:${trip.route_id}`).emit('trip_status_update', { tripId: socket.tripId, vehicleId: socket.vehicleId, status: 'completed', endTime: trip.actual_end_time });
    socket.tripId = null;
    logger.info(`Trip completed: ${trip.id} by driver: ${socket.driverId}`);
  } catch (error) {
    logger.error('Error ending trip:', error);
    socket.emit('error', { message: 'Failed to end trip' });
  }
};

const handlePassengerCountUpdate = async (socket, countData) => {
  try {
    if (!socket.tripId) { socket.emit('error', { message: 'No active trip found' }); return; }
    const { count, stopId } = countData;
    await pool.query('UPDATE trips SET passenger_count = $1 WHERE id = $2', [count, socket.tripId]);
    if (stopId) {
      await pool.query(`
        INSERT INTO trip_stops (trip_id, bus_stop_id, actual_arrival, passengers_boarded)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (trip_id, bus_stop_id) 
        DO UPDATE SET passengers_boarded = $3, actual_arrival = NOW()
      `, [socket.tripId, stopId, count]);
    }
    socket.to(`vehicle:${socket.vehicleId}`).emit('passenger_count_update', { vehicleId: socket.vehicleId, tripId: socket.tripId, passengerCount: count, stopId });
    logger.info(`Passenger count updated: ${count} for trip: ${socket.tripId}`);
  } catch (error) {
    logger.error('Error updating passenger count:', error);
    socket.emit('error', { message: 'Failed to update passenger count' });
  }
};

const calculateAndEmitETAs = async (socket, currentLocation) => {
  try {
    if (!socket.tripId) return;
    const stopsQuery = `
      SELECT bs.id, bs.name, ST_X(bs.location::geometry) as longitude, 
             ST_Y(bs.location::geometry) as latitude, rs.stop_order
      FROM route_stops rs
      JOIN bus_stops bs ON rs.bus_stop_id = bs.id
      JOIN trips t ON rs.route_id = t.route_id
      WHERE t.id = $1 AND rs.stop_order > (
        SELECT COALESCE(MAX(rs2.stop_order), 0)
        FROM trip_stops ts
        JOIN route_stops rs2 ON ts.bus_stop_id = rs2.bus_stop_id
        WHERE ts.trip_id = $1 AND ts.actual_arrival IS NOT NULL
      )
      ORDER BY rs.stop_order
      LIMIT 5
    `;
    const stopsResult = await pool.query(stopsQuery, [socket.tripId]);
    if (stopsResult.rows.length > 0) {
      const etaUpdates = [];
      for (const stop of stopsResult.rows) {
        const distance = calculateDistance(currentLocation.latitude, currentLocation.longitude, stop.latitude, stop.longitude);
        const averageSpeed = 30;
        const etaMinutes = Math.round((distance / averageSpeed) * 60);
        etaUpdates.push({ stopId: stop.id, stopName: stop.name, eta: etaMinutes, distance: Math.round(distance * 100) / 100 });
        await redisUtils.cacheETA(socket.tripId, stop.id, socket.vehicleId, { eta: etaMinutes, calculatedAt: new Date().toISOString() });
      }
      socket.to('passengers').emit('eta_update', { vehicleId: socket.vehicleId, tripId: socket.tripId, etas: etaUpdates });
    }
  } catch (error) {
    logger.error('Error calculating ETAs:', error);
  }
};

const handleDisconnection = async (socket) => {
  try {
    if (socket.userRole === 'driver' && socket.driverId) {
      await redisUtils.removeDriverSession(socket.driverId);
      await pool.query('UPDATE drivers SET status = $1 WHERE id = $2', ['inactive', socket.driverId]);
      logger.info(`Driver disconnected: ${socket.driverId}`);
    }
    logger.info(`User disconnected: ${socket.userId} (${socket.userRole})`);
  } catch (error) {
    logger.error('Error handling disconnection:', error);
  }
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

module.exports = { setupLocationSocket };

