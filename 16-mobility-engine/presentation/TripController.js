const {
    RideNotFoundError,
    RideAlreadyAcceptedError,
    InvalidRideStateTransitionError,
} = require('../domain/errors/RideErrors');
const driverService = require('../../07-driver-service/services/driver.service');

async function resolveTripActor(req) {
    const user = (req && req.user) || {};
    const userId = user.userId || user.id || user.sub || null;
    const role = String(user.role || '').toLowerCase();

    if (role === 'super_admin' || role === 'admin' || role === 'system') {
        return { userId, driverId: user.driverId || null, actorRole: role };
    }
    if (!role.includes('driver') && !role.includes('courier')) return null;
    if (!userId) return null;

    const driver = user.driverId ? { id: user.driverId } : await driverService.getDriverByUserId(userId);
    if (!driver || !driver.id) return null;
    return { userId, driverId: String(driver.id), actorRole: role };
}

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
            const passengerId = (req.user && (req.user.userId || req.user.id || req.user.sub)) || null;

            const rawCoordinates = [originLat, originLng, destLat, destLng];
            const coordinates = rawCoordinates.map(Number);
            if (!quoteId || !serviceType
                || rawCoordinates.some((value) => value === undefined || value === null || String(value).trim() === '')
                || coordinates.some((value) => !Number.isFinite(value))) {
                return res.status(400).json({
                    success: false,
                    error: 'پارامترهای quoteId، serviceType و چهار مختصات عددی مبدأ و مقصد الزامی هستند.',
                });
            }

            const result = await this.createTripUseCase.execute({
                passengerId,
                quoteId,
                originLat: coordinates[0],
                originLng: coordinates[1],
                destLat: coordinates[2],
                destLng: coordinates[3],
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
            const statusCode = Number(error.statusCode);
            if ([400, 403, 404, 409, 410, 503].includes(statusCode)) {
                return res.status(statusCode).json({
                    success: false,
                    code: error.code || null,
                    error: error.message || 'درخواست سفر قابل پردازش نیست.',
                });
            }
            // Unexpected infrastructure/programming errors must not leak database,
            // provider, or configuration details to API clients.
            return res.status(500).json({ success: false, error: 'خطای داخلی در ایجاد سفر. لطفاً دوباره تلاش کنید.' });
        }
    }

    async acceptTrip(req, res) {
        try {
            const { tripId } = req.params;
            const actor = await resolveTripActor(req);
            if (!actor || !actor.driverId) {
                return res.status(403).json({ success: false, error: 'پروفایل رانندهٔ معتبر برای این حساب پیدا نشد.' });
            }

            const result = await this.acceptTripUseCase.execute({
                tripId,
                driverId: actor.driverId,
                changedByUserId: actor.userId,
            });
            return res.status(200).json({
                success: true,
                message: 'سفر با موفقیت پذیرفته شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] acceptTrip error:', error);
            if (error.statusCode === 403) return res.status(403).json({ success: false, error: error.message });
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
            const actor = await resolveTripActor(req);
            if (!actor) return res.status(403).json({ success: false, error: 'دسترسی به عملیات راننده مجاز نیست.' });

            const result = await this.arriveAtPickupUseCase.execute({
                tripId, changedByUserId: actor.userId, driverId: actor.driverId, actorRole: actor.actorRole,
            });
            return res.status(200).json({
                success: true,
                message: 'رسیدن راننده ثبت شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] driverArrived error:', error);
            if (error.statusCode === 403) return res.status(403).json({ success: false, error: error.message });
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
            const actor = await resolveTripActor(req);
            if (!actor) return res.status(403).json({ success: false, error: 'دسترسی به عملیات راننده مجاز نیست.' });

            const result = await this.startTripUseCase.execute({
                tripId, changedByUserId: actor.userId, driverId: actor.driverId, actorRole: actor.actorRole,
            });
            return res.status(200).json({
                success: true,
                message: 'سفر آغاز شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] startTrip error:', error);
            if (error.statusCode === 403) return res.status(403).json({ success: false, error: error.message });
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
            const actor = await resolveTripActor(req);
            if (!actor) return res.status(403).json({ success: false, error: 'دسترسی به عملیات راننده مجاز نیست.' });

            // SECURITY: کرایه نهایی از کلاینت پذیرفته نمی‌شود؛ مبلغ معتبر از quote
            // ذخیره‌شده در سفر یا محاسبه سمت سرور تعیین می‌شود.
            const result = await this.endTripUseCase.execute({
                tripId, changedByUserId: actor.userId, driverId: actor.driverId, actorRole: actor.actorRole,
            });
            return res.status(200).json({
                success: true,
                message: 'سفر با موفقیت تکمیل شد.',
                data: result,
            });
        } catch (error) {
            console.error('[TripController] completeTrip error:', error);
            if (error.statusCode === 403) return res.status(403).json({ success: false, code: error.code || null, error: error.message });
            if (error instanceof RideNotFoundError) {
                return res.status(404).json({ success: false, error: error.message });
            }
            if (error instanceof InvalidRideStateTransitionError) {
                return res.status(400).json({ success: false, error: error.message });
            }
            if ([400, 409, 503].includes(Number(error.statusCode))) {
                return res.status(Number(error.statusCode)).json({
                    success: false,
                    code: error.code || null,
                    error: error.message || 'تکمیل سفر قابل پردازش نیست.',
                });
            }
            return res.status(500).json({ success: false, error: 'خطای داخلی در تکمیل سفر.' });
        }
    }

    async cancelTrip(req, res) {
        try {
            const { tripId } = req.params;
            const { cancelReason } = req.body || {};
            // نقش و شناسه فقط از توکن احرازشده گرفته می‌شوند.
            const callerRole = String(((req.user && req.user.role) || '')).toLowerCase();
            const userId = req.user && (req.user.userId || req.user.id || req.user.sub);
            const isDriverSide = callerRole.includes('driver') || callerRole.includes('courier');
            let cancelledByRole;
            let cancelledByUserId = userId || null;

            if (isDriverSide) {
                const actor = await resolveTripActor(req);
                if (!actor || !actor.driverId) {
                    return res.status(403).json({ success: false, error: 'پروفایل رانندهٔ معتبر برای این حساب پیدا نشد.' });
                }
                cancelledByRole = 'driver';
                cancelledByUserId = actor.driverId;
            } else if (callerRole === 'super_admin' || callerRole === 'admin') {
                cancelledByRole = 'admin';
            } else if (callerRole === 'system') {
                cancelledByRole = 'system';
            } else {
                cancelledByRole = 'passenger';
            }

            if (!cancelledByUserId && (cancelledByRole === 'passenger' || cancelledByRole === 'driver')) {
                return res.status(401).json({ success: false, error: 'شناسهٔ کاربر احرازشده در توکن وجود ندارد.' });
            }

            const result = await this.cancelTripUseCase.execute({
                tripId,
                cancelledByRole,
                cancelledByUserId,
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
