const {
    RideNotFoundError,
    RideAlreadyAcceptedError,
    InvalidRideStateTransitionError,
} = require('../domain/errors/RideErrors');

class RideController {
    constructor({ createRideUseCase, acceptRideUseCase }) {
        this.createRideUseCase = createRideUseCase;
        this.acceptRideUseCase = acceptRideUseCase;
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
}

module.exports = RideController;