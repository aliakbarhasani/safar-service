const express = require('express');
const { requireDriverRole } = require('../routes/dispatch.routes');

/**
 * creates the Mobility Engine Express router (unified trips API).
 * @param {Object} tripController - instance of TripController
 */
function createTripRouter(tripController) {
    const router = express.Router();

    // ساخت سفر جدید (احراز هویت در API Gateway اعمال می‌شود)
    router.post('/', tripController.createTrip.bind(tripController));

    // عملیات چرخه سفر که فقط راننده (یا super_admin) مجاز به انجام آن است.
    router.post('/:tripId/accept', requireDriverRole, tripController.acceptTrip.bind(tripController));
    router.post('/:tripId/arrived', requireDriverRole, tripController.driverArrived.bind(tripController));
    router.post('/:tripId/start', requireDriverRole, tripController.startTrip.bind(tripController));
    router.post('/:tripId/complete', requireDriverRole, tripController.completeTrip.bind(tripController));

    // لغو سفر می‌تواند توسط مسافر یا راننده انجام شود؛ مالکیت در UseCase بررسی می‌شود.
    router.post('/:tripId/cancel', tripController.cancelTrip.bind(tripController));

    return router;
}

module.exports = createTripRouter;