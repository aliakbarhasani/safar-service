/**
 * TripDomainEvents - Domain Layer (Mobility Engine)
 *
 * The 12 domain events for the unified mobility lifecycle, extracted from
 * `06-trip-service/services/trip-event.service.js`. These are the canonical
 * event names published on the EventBus by the unified engine.
 *
 * Event contract: each event carries a stable, serializable payload the
 * downstream modules (Wallet, Pricing, Notification, DriverMatching, Reviews)
 * can consume without the issuing module knowing them.
 */

const TripDomainEvents = Object.freeze({
    TripCreated: 'TripCreated',
    DriverSearchingStarted: 'DriverSearchingStarted',
    DriverAssigned: 'DriverAssigned',
    DriverAccepted: 'DriverAccepted',
    DriverArrived: 'DriverArrived',
    PassengerBoarded: 'PassengerBoarded',
    TripStarted: 'TripStarted',
    TripCompleted: 'TripCompleted',
    TripCancelledByPassenger: 'TripCancelledByPassenger',
    TripCancelledByDriver: 'TripCancelledByDriver',
    TripExpired: 'TripExpired',
    TripEmergencyCancelled: 'TripEmergencyCancelled',
});

module.exports = TripDomainEvents;