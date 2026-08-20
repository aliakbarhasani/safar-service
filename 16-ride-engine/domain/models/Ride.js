/**
 * Ride - Domain Model (Ride Engine)
 *
 * Encapsulates the ride lifecycle state machine. Transitions are validated
 * against the allowed flow:
 *
 *   REQUESTED -> SEARCHING -> ACCEPTED -> ARRIVED -> IN_PROGRESS -> COMPLETED
 *        \  (CANCELLED can be requested from REQUESTED/SEARCHING)
 *
 * All transitions are strictly guarded; invalid transitions throw a typed
 * InvalidRideStateTransitionError. No transition is allowed once the ride is
 * COMPLETED or CANCELLED.
 */

const RideStatus = require('../enums/RideStatus');
const { InvalidRideStateTransitionError } = require('../errors/RideErrors');

class Ride {
    constructor({ id, passengerId, driverId, quoteId, status, origin, destination, createdAt, updatedAt }) {
        this.id = id || null;
        this.passengerId = passengerId;
        this.driverId = driverId || null;
        this.quoteId = quoteId;
        this.status = status || RideStatus.REQUESTED;
        this.origin = origin;       // { lat, lng }
        this.destination = destination; // { lat, lng }
        this.createdAt = createdAt || new Date();
        this.updatedAt = updatedAt || new Date();
        this.statusHistory = [];
    }

    /** Validates that the ride is currently in `expected` status (else throws). */
    _requireStatus(expected, action) {
        if (this.status !== expected) {
            throw new InvalidRideStateTransitionError(this.status, action, expected);
        }
    }

    /** Marks a transition; guards terminal states. */
    _transitionTo(newStatus, action) {
        if (this.status === RideStatus.COMPLETED || this.status === RideStatus.CANCELLED) {
            throw new InvalidRideStateTransitionError(this.status, action);
        }
        this.statusHistory.push({ from: this.status, to: newStatus, at: new Date() });
        this.status = newStatus;
        this.updatedAt = new Date();
    }

    /** Moves the ride into searching-for-a-driver phase. */
    requestDriver() {
        this._requireStatus(RideStatus.REQUESTED, 'requestDriver');
        this._transitionTo(RideStatus.SEARCHING, 'requestDriver');
        return this;
    }

    /** A driver accepts the ride — only allowed while SEARCHING. */
    accept(driverId) {
        this._requireStatus(RideStatus.SEARCHING, 'accept');
        if (!driverId) {
            throw new Error('شناسه راننده برای پذیرش سفر الزامی است.');
        }
        this.driverId = driverId;
        this._transitionTo(RideStatus.ACCEPTED, 'accept');
        return this;
    }

    /** Driver arrived at the pickup point — only while ACCEPTED. */
    driverArrived() {
        this._requireStatus(RideStatus.ACCEPTED, 'driverArrived');
        this._transitionTo(RideStatus.ARRIVED, 'driverArrived');
        return this;
    }

    /** Trip started — only while ARRIVED. */
    startTrip() {
        this._requireStatus(RideStatus.ARRIVED, 'startTrip');
        this._transitionTo(RideStatus.IN_PROGRESS, 'startTrip');
        return this;
    }

    /** Trip finished — only while IN_PROGRESS. */
    complete() {
        this._requireStatus(RideStatus.IN_PROGRESS, 'complete');
        this._transitionTo(RideStatus.COMPLETED, 'complete');
        return this;
    }

    /** Cancel — only while REQUESTED or SEARCHING. */
    cancel() {
        if (this.status !== RideStatus.REQUESTED && this.status !== RideStatus.SEARCHING) {
            throw new InvalidRideStateTransitionError(this.status, 'cancel');
        }
        this._transitionTo(RideStatus.CANCELLED, 'cancel');
        return this;
    }

    /** Snapshot for persistence. */
    toDatabaseRecord() {
        return {
            id: this.id,
            passenger_id: this.passengerId,
            driver_id: this.driverId,
            quote_id: this.quoteId,
            status: this.status,
            origin_lat: this.origin && this.origin.lat,
            origin_lng: this.origin && this.origin.lng,
            dest_lat: this.destination && this.destination.lat,
            dest_lng: this.destination && this.destination.lng,
            created_at: this.createdAt,
            updated_at: this.updatedAt,
        };
    }
}

module.exports = Ride;