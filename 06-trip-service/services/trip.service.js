/**
 * trip.service.js - سرویس جامع سفر (PostgreSQL)
 * 
 * این سرویس مستقیماً روی PostgreSQL کار می‌کند.
 * 
 * معماری:
 *   - تراکنش‌های اتمیک PostgreSQL
 *   - Optimistic Concurrency Control (version)
 *   - Timeline recording on every status change
 *   - 12 Domain Events on EventBus
 *   - Pricing Gateway (Decoupled)
 *   - Soft Delete
 *   - 6 Service Types
 */

const pg = require('../db/pg');
const Trip = require('../models/trip.model');
const TripLocation = require('../models/trip-location.model');
const stateMachine = require('./trip-state.service');
const pricingGateway = require('../gateways/pricing.gateway');
const tripEvent = require('./trip-event.service');
const tripTimeline = require('./trip-timeline.service');

class ConcurrencyConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConcurrencyConflictError';
    this.statusCode = 409;
  }
}

function validateRequired(value, fieldName) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`${fieldName} is required`);
  }
}

/**
 * ایجاد درخواست سفر جدید
 * قیمت از pricing gateway دریافت می‌شود (بدون فرمول داخلی)
 */
async function createTripRequest(data) {
  const {
    passengerId, originAddress, originLatitude, originLongitude,
    destinationAddress, destinationLatitude, destinationLongitude,
    paymentMethod = 'wallet', serviceType = 'taxi',
    currencyId = null, countryId = null,
    distanceKm, durationMin,
  } = data;

  validateRequired(passengerId, 'passengerId');
  validateRequired(originAddress, 'originAddress');
  validateRequired(destinationAddress, 'destinationAddress');

  const finalServiceType = stateMachine.isValidServiceType(serviceType) ? serviceType : 'taxi';

  // دریافت قیمت از Pricing Gateway (Decoupled)
  const pricing = await pricingGateway.getQuote({
    serviceType: finalServiceType,
    originLatitude, originLongitude,
    destinationLatitude, destinationLongitude,
    distanceKm: distanceKm || null,
    durationMin: durationMin || null,
    countryId, currencyId,
  });

  return await pg.transaction(async (client) => {
    const trip = await Trip.create({
      passengerId, originAddress, originLatitude, originLongitude,
      destinationAddress, destinationLatitude, destinationLongitude,
      paymentMethod, estimatedCost: pricing.estimatedCost,
      baseFare: pricing.baseFare, commissionRate: pricing.commissionRate,
      commissionAmount: pricing.commissionAmount, driverEarning: pricing.driverEarning,
      currencyId: pricing.currencyId, serviceType: finalServiceType, countryId,
    }, client);

    await TripLocation.create({ tripId: trip.id, pointType: 'origin', latitude: originLatitude, longitude: originLongitude, address: originAddress });

    // Timeline
    await tripTimeline.recordTransition(client, trip.id, null, 'requested', {
      changedBy: passengerId, changedByRole: 'passenger', metadata: { serviceType: finalServiceType, pricing },
    });

    // Domain events
    tripEvent.emitTripCreated(trip, pricing);

    return { success: true, message: 'Trip request created successfully', trip: { id: trip.id, passengerId: trip.passenger_id, status: trip.status, originAddress: trip.origin_address, destinationAddress: trip.destination_address, estimatedCost: trip.estimated_cost, serviceType: trip.service_type, paymentMethod: trip.payment_method, createdAt: trip.created_at }, pricing };
  });
}

/**
 * تخصیص راننده با Optimistic Concurrency Control
 */
async function assignDriver(tripId, driverId, expectedVersion = null) {
  validateRequired(tripId, 'tripId');
  validateRequired(driverId, 'driverId');

  return await pg.transaction(async (client) => {
    const trip = await Trip.findById(tripId);
    if (!trip) throw new Error('Trip not found');

    const validation = stateMachine.validateTransition(trip.status, stateMachine.TripStatus.ACCEPTED);
    if (!validation.valid) throw new Error(validation.message);

    const driverResult = await client.query(`SELECT id, operational_status FROM drivers WHERE id = $1 AND deleted_at IS NULL`, [driverId]);
    const driver = driverResult.rows[0];
    if (!driver) throw new Error('Driver not found');
    if (driver.operational_status !== 'online') throw new Error(`Driver is ${driver.operational_status}, not 'online'`);

    // OCC: use expectedVersion if provided
    const extraFields = { _expectedVersion: expectedVersion || trip.version };
    const updatedTrip = await Trip.assignDriver(tripId, driverId, client);
    if (!updatedTrip) throw new ConcurrencyConflictError('Trip state was modified by another request. Please retry.');

    await client.query(`UPDATE drivers SET operational_status = 'busy', updated_at = NOW() WHERE id = $1`, [driverId]);

    await tripTimeline.recordTransition(client, trip.id, trip.status, 'accepted', {
      changedBy: driverId, changedByRole: 'driver', metadata: { assignedBy: 'system' },
    });

    tripEvent.emitByStatus(updatedTrip, trip.status, 'accepted');

    return { success: true, message: 'Driver assigned successfully', trip: { id: updatedTrip.id, passengerId: updatedTrip.passenger_id, driverId: updatedTrip.driver_id, status: updatedTrip.status, version: updatedTrip.version } };
  });
}

/**
 * به‌روزرسانی وضعیت با OCC و Timeline
 */
async function updateTripStatus(tripId, newStatus, extraFields = {}) {
  validateRequired(tripId, 'tripId');
  validateRequired(newStatus, 'newStatus');

  return await pg.transaction(async (client) => {
    const trip = await Trip.findById(tripId);
    if (!trip) throw new Error('Trip not found');

    const previousStatus = trip.status;
    const validation = stateMachine.validateTransition(previousStatus, newStatus);
    if (!validation.valid) throw new Error(validation.message);

    const updateFields = { ...extraFields };

    if (newStatus === stateMachine.TripStatus.IN_PROGRESS) updateFields.started_at = new Date();
    if (newStatus === stateMachine.TripStatus.COMPLETED) {
      updateFields.finished_at = new Date();
      if (!updateFields.final_cost) updateFields.final_cost = trip.estimated_cost;
    }
    if (newStatus === stateMachine.TripStatus.ARRIVED) updateFields.passenger_boarded = false;

    // Optimistic Concurrency Control
    updateFields._expectedVersion = trip.version;

    const updatedTrip = await Trip.updateStatus(tripId, newStatus, updateFields, client);
    if (!updatedTrip) throw new ConcurrencyConflictError('Trip state was modified by another request. Please retry.');

    // Timeline recording
    await tripTimeline.recordTransition(client, trip.id, previousStatus, newStatus, {
      changedBy: extraFields.changedBy || null,
      changedByRole: extraFields.changedByRole || null,
      reason: updatedTrip.cancel_reason || null,
      coordinates: extraFields.latitude ? { latitude: extraFields.latitude, longitude: extraFields.longitude } : null,
    });

    // Domain events
    tripEvent.emitByStatus(updatedTrip, previousStatus, newStatus);

    return { success: true, message: `Trip status updated to '${newStatus}'`, trip: { id: updatedTrip.id, status: updatedTrip.status, previousStatus, version: updatedTrip.version, driverId: updatedTrip.driver_id, passengerId: updatedTrip.passenger_id, serviceType: updatedTrip.service_type } };
  });
}

async function cancelByPassenger(tripId, reason = '') {
  return await updateTripStatus(tripId, stateMachine.TripStatus.CANCELLED_BY_PASSENGER, {
    cancel_reason: reason || 'Cancelled by passenger', cancelled_by: 'user', changedByRole: 'passenger',
  });
}

async function cancelByDriver(tripId, reason = '') {
  return await updateTripStatus(tripId, stateMachine.TripStatus.CANCELLED_BY_DRIVER, {
    cancel_reason: reason || 'Cancelled by driver', cancelled_by: 'driver', changedByRole: 'driver',
  });
}

async function recordDriverLocation(tripId, latitude, longitude) {
  validateRequired(tripId, 'tripId');
  const location = await TripLocation.create({ tripId, pointType: 'driver_location', latitude, longitude });
  return { success: true, location };
}

async function getTripRoute(tripId) {
  validateRequired(tripId, 'tripId');
  const locations = await TripLocation.findByTripId(tripId);
  return { success: true, locations };
}

async function getTripById(tripId) {
  validateRequired(tripId, 'tripId');
  const trip = await Trip.findById(tripId);
  if (!trip) throw new Error('Trip not found');
  return { success: true, trip };
}

async function getTripsByPassenger(passengerId, options = {}) {
  validateRequired(passengerId, 'passengerId');
  const trips = await Trip.findByPassengerId(passengerId, options);
  return { success: true, trips, total: trips.length };
}

async function getTripsByDriver(driverId, options = {}) {
  validateRequired(driverId, 'driverId');
  const trips = await Trip.findByDriverId(driverId, options);
  return { success: true, trips, total: trips.length };
}

async function getAllTrips(options = {}) {
  const trips = await Trip.findAll(options);
  return { success: true, trips, total: trips.length };
}

async function getTripTimeline(tripId) {
  validateRequired(tripId, 'tripId');
  const timeline = await tripTimeline.getTimeline(tripId);
  return { success: true, timeline };
}

module.exports = {
  createTripRequest, assignDriver, updateTripStatus,
  cancelByPassenger, cancelByDriver, recordDriverLocation,
  getTripRoute, getTripById, getTripsByPassenger, getTripsByDriver,
  getAllTrips, getTripTimeline,
  ConcurrencyConflictError,
};