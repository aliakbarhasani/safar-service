const express = require('express');

/**
 * creates the Ride Engine Express router.
 * @param {Object} rideController - instance of RideController
 */
function createRideRouter(rideController) {
    const router = express.Router();

    // ساخت سفر جدید (مسیر عمومی، در صورت نیاز احراز هویت در Gateway اعمال می‌شود)
    router.post('/', rideController.createRide.bind(rideController));

    // پذیرش سفر توسط راننده (با کنترل همزمانی)
    router.post('/:rideId/accept', rideController.acceptRide.bind(rideController));

    return router;
}

module.exports = createRideRouter;