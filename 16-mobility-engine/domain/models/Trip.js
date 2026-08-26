/**
 * Trip - Domain Model (Mobility Engine)
 *
 * The unified domain entity for all mobility services (taxi, intercity,
 * freight/barberry, courier/pick, tourism, cross-border).
 *
 * Encapsulates the 9-state lifecycle state machine merged from the former
 * RideEngine model (`16-ride-engine`) and the rich trip data model
 * (`06-trip-service/models/trip.model.js`).
 *
 * State transitions are strictly guarded; invalid transitions throw a typed
 * InvalidRideStateTransitionError. No transition is allowed after a terminal
 * state (COMPLETED / CANCELLED* / EXPIRED).
 */

const TripStatus = require('../enums/TripStatus');
const { InvalidRideStateTransitionError } = require('../errors/RideErrors');

class Trip {
    constructor({
        id = null,
        passengerId,
        driverId = null,
        quoteId = null,
        status = null,
        origin = null,          // { lat, lng }
        destination = null,     // { lat, lng }
        originAddress = null,
        destinationAddress = null,
        serviceType = null,
        paymentMethod = null,
        currencyId = null,
        estimatedCost = null,
        finalCost = null,
        baseFare = null,
        commissionRate = null,
        commissionAmount = null,
        driverEarning = null,
        countryId = null,
        startedAt = null,
        finishedAt = null,
        version = 1,
        createdAt = null,
        updatedAt = null,
    }) {
        this.id = id;
        this.passengerId = passengerId;
        this.driverId = driverId;
        this.quoteId = quoteId;
        this.status = status || TripStatus.REQUESTED;
        this.origin = origin;
        this.destination = destination;
        this.originAddress = originAddress;
        this.destinationAddress = destinationAddress;
        this.serviceType = serviceType;
        this.paymentMethod = paymentMethod;
        this.currencyId = currencyId;
        this.estimatedCost = estimatedCost;
        this.finalCost = finalCost;
        this.baseFare = baseFare;
        this.commissionRate = commissionRate;
        this.commissionAmount = commissionAmount;
        this.driverEarning = driverEarning;
        this.countryId = countryId;
        this.startedAt = startedAt;
        this.finishedAt = finishedAt;
        this.version = version;
        this.createdAt = createdAt || new Date();
        this.updatedAt = updatedAt || new Date();
        this.statusHistory = [];
    }

    /** Guards that the trip is currently in `expected` status (else throws). */
    _requireStatus(expected, action) {
        if (this.status !== expected) {
            throw new InvalidRideStateTransitionError(this.status, action, expected);
        }
    }

    /** Guards terminal states, records history, and advances status. */
    _transitionTo(newStatus, action) {
        if (TripStatus.isTerminalStatus(this.status)) {
            throw new InvalidRideStateTransitionError(this.status, action);
        }
        this.statusHistory.push({ from: this.status, to: newStatus, at: new Date() });
        this.status = newStatus;
        this.updatedAt = new Date();
    }

    /** REQUESTED -> SEARCHING (start searching for a driver). */
    requestDriver() {
        this._requireStatus(TripStatus.REQUESTED, 'requestDriver');
        this._transitionTo(TripStatus.SEARCHING, 'requestDriver');
        return this;
    }

    /** SEARCHING -> ACCEPTED (a driver accepts). */
    accept(driverId) {
        this._requireStatus(TripStatus.SEARCHING, 'accept');
        if (!driverId) {
            throw new Error('شناسه راننده برای پذیرش سفر الزامی است.');
        }
        this.driverId = driverId;
        this._transitionTo(TripStatus.ACCEPTED, 'accept');
        return this;
    }

    /** ACCEPTED -> ARRIVED (driver arrived at pickup). */
    driverArrived() {
        this._requireStatus(TripStatus.ACCEPTED, 'driverArrived');
        this._transitionTo(TripStatus.ARRIVED, 'driverArrived');
        return this;
    }

    /** ARRIVED -> IN_PROGRESS (trip started). */
    startTrip() {
        this._requireStatus(TripStatus.ARRIVED, 'startTrip');
        if (!this.startedAt) this.startedAt = new Date();
        this._transitionTo(TripStatus.IN_PROGRESS, 'startTrip');
        return this;
    }

    /** IN_PROGRESS -> COMPLETED (trip finished). */
    complete() {
        this._requireStatus(TripStatus.IN_PROGRESS, 'complete');
        if (!this.finishedAt) this.finishedAt = new Date();
        this._transitionTo(TripStatus.COMPLETED, 'complete');
        return this;
    }

    /** REQUESTED/SEARCHING -> CANCELLED (generic cancel). */
    cancel() {
        if (this.status !== TripStatus.REQUESTED && this.status !== TripStatus.SEARCHING) {
            throw new InvalidRideStateTransitionError(this.status, 'cancel');
        }
        this._transitionTo(TripStatus.CANCELLED, 'cancel');
        return this;
    }

    /**
     * Snapshot for persistence covering both the unified `trips` schema and the
     * legacy `rides` column expectations. Phase-2 repository maps to `trips`.
     * @returns {Object}
     */
    toDatabaseRecord() {
        return {
            id: this.id,
            passenger_id: this.passengerId,
            driver_id: this.driverId,
            quote_id: this.quoteId,
            status: this.status,
            service_type: this.serviceType,
            origin_lat: this.origin && this.origin.lat,
            origin_lng: this.origin && this.origin.lng,
            origin_address: this.originAddress,
            dest_lat: this.destination && this.destination.lat,
            dest_lng: this.destination && this.destination.lng,
            destination_address: this.destinationAddress,
            payment_method: this.paymentMethod,
            currency_id: this.currencyId,
            estimated_cost: this.estimatedCost,
            final_cost: this.finalCost,
            base_fare: this.baseFare,
            commission_rate: this.commissionRate,
            commission_amount: this.commissionAmount,
            driver_earning: this.driverEarning,
            country_id: this.countryId,
            started_at: this.startedAt,
            finished_at: this.finishedAt,
            version: this.version,
            created_at: this.createdAt,
            updated_at: this.updatedAt,
        };
    }
}

module.exports = Trip;