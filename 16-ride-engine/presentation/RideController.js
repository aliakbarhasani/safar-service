const {
    RideNotFoundError,
    RideAlreadyAcceptedError,
    InvalidRideStateTransitionError,
    InvalidRideStateError,
} = require('../domain/errors/RideErrors');

class RideController {
    constructor({
        createRideUseCase,
        acceptRideUseCase,
        driverArrivedUseCase,
        startTripUseCase,
        completeRideUseCase,
        cancelRideUseCase,
    }) {
        this.createRideUseCase = createRideUseCase;
        this.acceptRideUseCase = acceptRideUseCase;
        this.driverArrivedUseCase = driverArrivedUseCase;
        this.startTripUseCase = startTripUseCase;
        this.completeRideUseCase = completeRideUseCase;
        this.cancelRideUseCase = cancelRideUseCase;
    }

    async createRide(req, res) {
        try {
            const { quoteId, originLat, originLng, destLat, destLng } = req.body;
            const passengerId = (req.user && req.user.userId) || req.body.passengerId;

            if (!quoteId || originLat === undefined || destLat === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'پارامترهای quoteId و مختصات (originLat/destLat) الزامی هستند.',
                });
            }

            const result = await this.createRideUseCase.execute({
                passengerId,
                quoteId,
                originLat: Number(originLat),
                originLng: Number(originLng),
                destLat: Number(destLat),
                destLng: Number(destLng),
                referenceId: req.body.referenceId || null,
            });

            return res.status(201).json({ success: true, message: 'سفر با موفقیت ایجاد شد.', data: result });
        } catch (error) {
            console.error('[RideController] createRide error:', error);
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در ایجاد سفر.' });
        }
    }

    async acceptRide(req, res) {
        try {
            const { rideId } = req.params;
            const driverId = (req.user && req.user.userId) || (req.body && req.body.driverId);

            if (!rideId || !driverId) {
                return res.status(400).json({ success: false, error: 'پارامترهای rideId و driverId الزامی هستند.' });
            }

            const result = await this.acceptRideUseCase.execute({ rideId, driverId });

            return res.status(200).json({ success: true, message: 'سفر توسط راننده پذیرفته شد.', data: result });
        } catch (error) {
            console.error('[RideController] acceptRide error:', error);

            if (error instanceof RideNotFoundError || error.code === 'RIDE_NOT_FOUND') {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof RideAlreadyAcceptedError || error.code === 'RIDE_ALREADY_ACCEPTED') {
                return res.status(409).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateTransitionError || error.code === 'INVALID_RIDE_STATE_TRANSITION') {
                return res.status(409).json({ success: false, error: error.message });
            }
            if (error.code === 'ACCEPT_RIDE_VALIDATION' || error.statusCode === 400) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: 'خطای داخلی در پذیرش سفر.' });
        }
    }
async driverArrived(req, res) {
        try {
            const { rideId } = req.params;
            const userId = (req.user && req.user.userId) || (req.body && req.body.userId);

            if (!rideId) {
                return res.status(400).json({ success: false, error: 'پارامتر rideId الزامی است.' });
            }

            const result = await this.driverArrivedUseCase.execute({ rideId, changedByUserId: userId });

            return res.status(200).json({ success: true, message: 'راننده در محل سفر رسید.', data: result });
        } catch (error) {
            console.error('[RideController] driverArrived error:', error);

            if (error instanceof RideNotFoundError || error.code === 'RIDE_NOT_FOUND') {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateError || error.code === 'INVALID_RIDE_STATE') {
                return res.status(400).json({ success: false, error: error.message });
            }
            if (error.code === 'ARRIVED_VALIDATION' || error.statusCode === 400) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: 'خطای داخلی در ثبت رسید راننده.' });
        }
    }

    async startTrip(req, res) {
        try {
            const { rideId } = req.params;
            const userId = (req.user && req.user.userId) || (req.body && req.body.userId);

            if (!rideId) {
                return res.status(400).json({ success: false, error: 'پارامتر rideId الزامی است.' });
            }

            const result = await this.startTripUseCase.execute({ rideId, changedByUserId: userId });

            return res.status(200).json({ success: true, message: 'سفر شروع شد.', data: result });
        } catch (error) {
            console.error('[RideController] startTrip error:', error);

            if (error instanceof RideNotFoundError || error.code === 'RIDE_NOT_FOUND') {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateError || error.code === 'INVALID_RIDE_STATE') {
                return res.status(400).json({ success: false, error: error.message });
            }
            if (error.code === 'START_TRIP_VALIDATION' || error.statusCode === 400) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: 'خطای داخلی در شروع سفر.' });
        }
    }

    async completeRide(req, res) {
        try {
            const { rideId } = req.params;
            const userId = (req.user && req.user.userId) || (req.body && req.body.userId);

            if (!rideId) {
                return res.status(400).json({ success: false, error: 'پارامتر rideId الزامی است.' });
            }

            const result = await this.completeRideUseCase.execute({ rideId, changedByUserId: userId });

            return res.status(200).json({ success: true, message: 'سفر با موفقیت تکمیل شد.', data: result });
        } catch (error) {
            console.error('[RideController] completeRide error:', error);

            if (error instanceof RideNotFoundError || error.code === 'RIDE_NOT_FOUND') {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateError || error.code === 'INVALID_RIDE_STATE') {
                return res.status(400).json({ success: false, error: error.message });
            }
            if (error.code === 'COMPLETE_RIDE_VALIDATION' || error.statusCode === 400) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: 'خطای داخلی در تکمیل سفر.' });
        }
    }

    async cancelRide(req, res) {
        try {
            const { rideId } = req.params;
            const userId = (req.user && req.user.userId) || (req.body && req.body.userId);

            if (!rideId) {
                return res.status(400).json({ success: false, error: 'پارامتر rideId الزامی است.' });
            }

            const result = await this.cancelRideUseCase.execute({ rideId, changedByUserId: userId });

            return res.status(200).json({ success: true, message: 'سفر لغو شد.', data: result });
        } catch (error) {
            console.error('[RideController] cancelRide error:', error);

            if (error instanceof RideNotFoundError || error.code === 'RIDE_NOT_FOUND') {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateError || error.code === 'INVALID_RIDE_STATE') {
                return res.status(400).json({ success: false, error: error.message });
            }
            if (error.code === 'CANCEL_RIDE_VALIDATION' || error.statusCode === 400) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: 'خطای داخلی در لغو سفر.' });
        }
    }
}

module.exports = RideController;