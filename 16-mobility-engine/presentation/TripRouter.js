const express = require('express');

/**
 * creates the Mobility Engine Express router (unified trips API).
 * @param {Object} tripController - instance of TripController
 */
function createTripRouter(tripController) {
    const router = express.Router();

    // ساخت سفر جدید (مسیر عمومی، در صورت نیاز احراز هویت در Gateway اعمال می‌شود)
    router.post('/', tripController.createTrip.bind(tripController));

    // پذیرش سفر توسط راننده (با کنترل همزمانی)
    router.post('/:tripId/accept', tripController.acceptTrip.bind(tripController));

    // راننده به مبدأ رسید
    router.post('/:tripId/arrived', tripController.driverArrived.bind(tripController));

    // شروع سفر
    router.post('/:tripId/start', tripController.startTrip.bind(tripController));

    // تکمیل سفر
    router.post('/:tripId/complete', tripController.completeTrip.bind(tripController));

    // لغو سفر
    router.post('/:tripId/cancel', tripController.cancelTrip.bind(tripController));

    return router;
}

module.exports = createTripRouter;