const {
    RideNotFoundError,
    RideAlreadyAcceptedError,
    InvalidRideStateTransitionError,
} = require('../domain/errors/RideErrors');

class TripController {
    constructor({
        createTripUseCase,
        acceptTripUseCase,
        arriveAtPickupUseCase,
        startTripUseCase,
        endTripUseCase,
        cancelTripUseCase,
    }) {
        this.createTripUseCase = createTripUseCase;
        this.acceptTripUseCase = acceptTripUseCase;
        this.arriveAtPickupUseCase = arriveAtPickupUseCase;
        this.startTripUseCase = startTripUseCase;
        this.endTripUseCase = endTripUseCase;
        this.cancelTripUseCase = cancelTripUseCase;
    }

    async createTrip(req, res) {
        try {
            const {
                quoteId, originLat, originLng, destLat, destLng,
                originAddress, destinationAddress, serviceType,
                paymentMethod, countryId, referenceId,
            } = req.body;
            const passengerId = (req.user && (req.user.userId || req.user.id)) || null;

            if (!quoteId || !serviceType || originLat === undefined || destLat === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'پارامترهای quoteId، serviceType و مختصات (originLat/destLat) الزامی هستند.',
                });
            }

            const result = await this.createTripUseCase.execute({
                passengerId,
                quoteId,
                originLat: Number(originLat),
                originLng: Number(originLng),
                destLat: Number(destLat),
                destLng: Number(destLng),
                originAddress: originAddress || null,
                destinationAddress: destinationAddress || null,
                serviceType,
                paymentMethod: paymentMethod || null,
                countryId: countryId || null,
                referenceId: referenceId || null,
            });

            return res.status(201).json({ success: true, message: 'سفر با موفقیت ایجاد شد.', data: result });
        } catch (error) {
            console.error('[TripController] createTrip error:', error);
            if (error.code === 'TRIP_SERVICE_TYPE_INVALID' || error.statusCode === 400) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در ایجاد سفر.' });
        }
    }

    async acceptTrip(req, res) {
        try {
            const { tripId } = req.params;
            // SECURITY: هویت راننده منحصراً از توکن (req.user)، هرگز از بدی/هدر.
            const driverId = (req.user && (req.user.driverId || req.user.userId || req.user.id)) || null;
            const changedByUserId = (req.user && (req.user.userId || req.user.id)) || null;

            const result = await this.acceptTripUseCase.execute({ tripId, driverId, changedByUserId });
            return res.status(200).json({
                success: true,
                message: 'سفر با موفقیت پذیرفته شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] acceptTrip error:', error);
            if (error instanceof RideNotFoundError) {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof RideAlreadyAcceptedError) {
                return res.status(409).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateTransitionError) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در پذیرش سفر.' });
        }
    }

    async driverArrived(req, res) {
        try {
            const { tripId } = req.params;
            const changedByUserId = (req.user && (req.user.userId || req.user.id)) || null;

            const result = await this.arriveAtPickupUseCase.execute({ tripId, changedByUserId });
            return res.status(200).json({
                success: true,
                message: 'رسیدن راننده ثبت شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] driverArrived error:', error);
            if (error instanceof RideNotFoundError) {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateTransitionError) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در ثبت رسیدن راننده.' });
        }
    }

    async startTrip(req, res) {
        try {
            const { tripId } = req.params;
            const changedByUserId = (req.user && (req.user.userId || req.user.id)) || null;

            const result = await this.startTripUseCase.execute({ tripId, changedByUserId });
            return res.status(200).json({
                success: true,
                message: 'سفر آغاز شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] startTrip error:', error);
            if (error instanceof RideNotFoundError) {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateTransitionError) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در شروع سفر.' });
        }
    }

    async completeTrip(req, res) {
        try {
            const { tripId } = req.params;
            const changedByUserId = (req.user && (req.user.userId || req.user.id)) || null;

            // SECURITY: کرایه نهایی از کلاینت پذیرفته نمی‌شود؛ مبلغ معتبر از quote
            // ذخیره‌شده در سفر یا محاسبه سمت سرور تعیین می‌شود.
            const result = await this.endTripUseCase.execute({ tripId, changedByUserId });
            return res.status(200).json({
                success: true,
                message: 'سفر با موفقیت تکمیل شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] completeTrip error:', error);
            if (error instanceof RideNotFoundError) {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateTransitionError) {
                return res.status(400).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در تکمیل سفر.' });
        }
    }

    async cancelTrip(req, res) {
        try {
            const { tripId } = req.params;
            const { cancelReason } = req.body || {};
            // SECURITY: نقش و هویت فاعل منحصراً از توکن احرازشده (req.user) گرفته می‌شود؛
            // هرگز از هدر (x-caller-role) یا بدی (role/userId) پذیرفته نمی‌شود.
            const callerRole = String(((req.user && req.user.role) || 'passenger')).toLowerCase();
            const isDriverSide = callerRole.includes('driver') || callerRole.includes('courier');

            const result = await this.cancelTripUseCase.execute({
                tripId,
                cancelledByRole: isDriverSide ? 'driver' : 'passenger',
                cancelledByUserId: (req.user && (req.user.userId || req.user.id)) || null,
                reason: cancelReason || null,
            });

            return res.status(200).json({
                success: true,
                message: 'سفر لغو شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] cancelTrip error:', error);
            if (error instanceof RideNotFoundError) {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error.statusCode === 403 || error.code === 'TRIP_CANCEL_FORBIDDEN') {
                return res.status(403).json({ success: false, error: error.message });
            }
            if (error.statusCode === 409 || error.code === 'TRIP_ALREADY_TERMINAL'
                || error instanceof InvalidRideStateTransitionError) {
                return res.status(409).json({ success: false, error: error.message });
            }
            return res.status(500).json({ success: false, error: error.message || 'خطای داخلی در لغو سفر.' });
        }
    }
}

module.exports = TripController;
