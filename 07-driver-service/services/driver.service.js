/**
 * driver.service.js - سرویس مستقل رانندگان (PostgreSQL)
 *
 * طبق اصول Clean Architecture:
 *   - تمام منطق تجاری در لایه Service
 *   - دسترسی به داده فقط از طریق Repository (PostgreSQL)
 *   - بدون Fallback درون‌حافظه و بدون Mongoose
 */

const { DriverRepository } = require('../infrastructure/repositories/DriverRepository');
const eventBus = require('../../01-core-system/EventBus');

const ACCOUNT_STATUSES = ['pending_verification', 'verified', 'rejected', 'suspended', 'blocked'];
const OPERATIONAL_STATUSES = ['offline', 'online', 'busy', 'on_trip'];

function isExpired(expiry) {
  return expiry && new Date(expiry) < new Date();
}

/**
 * کارخانه ساخت سرویس رانندگان (Dependency Injection)
 * @param {DriverRepository} [repository] - مخزن PostgreSQL (برای تست تزریق می‌شود)
 */
function createDriverService(repository = new DriverRepository()) {
  /** ثبت‌نام اولیه راننده؛ accountStatus همیشه روی pending_verification قرار می‌گیرد */
  async function registerDriver(data) {
    data = data || {};
    if (!data.firstName || !data.lastName || !data.phoneNumber) {
      return { error: 'firstName, lastName and phoneNumber are required' };
    }
    if (!data.userId) {
      return { error: 'userId is required to register a driver' };
    }

    const existing = await repository.findByPhoneNumber(data.phoneNumber);
    if (existing) {
      return { error: 'Driver with this phone number already exists' };
    }

    return repository.create({
      userId: data.userId,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      dateOfBirth: data.dateOfBirth || new Date('1990-01-01'),
      address: data.address || '',
      vehicleType: data.vehicleType || '',
      licensePlate: data.licensePlate || '',
      chassisNumber: data.chassisNumber || '',
      licenseNumber: data.licenseNumber || '',
      vehicleIdentificationNumber: data.vehicleIdentificationNumber || '',
      identityCardNumber: data.identityCardNumber || '',
      identityCardUrl: data.identityCardUrl || '',
      selfieUrl: data.selfieUrl || '',
      drivingLicenseUrl: data.drivingLicenseUrl || '',
      transitPassUrl: data.transitPassUrl || '',
      vehicleCardUrl: data.vehicleCardUrl || '',
      licenseExpiryDate: data.licenseExpiryDate || null,
      insuranceExpiryDate: data.insuranceExpiryDate || null,
      registrationExpiryDate: data.registrationExpiryDate || null,
      documents: data.documents || [],
    });
  }

  /** تغییر وضعیت حساب راننده توسط ادمین */
  async function updateDriverAccountStatus(driverId, newStatus, adminId) {
    if (!ACCOUNT_STATUSES.includes(newStatus)) {
      return { error: 'Invalid driver account status' };
    }
    const driver = await repository.findById(driverId);
    if (!driver) return { error: 'Driver not found' };

    const previousStatus = driver.accountStatus;
    const updated = await repository.updateAccountStatus(driverId, newStatus);

    eventBus.publish('DriverStatusChanged', {
      driverId: updated.id || driverId,
      previousStatus,
      newStatus,
      changedBy: adminId || 'system',
    });

    return updated;
  }

  /** تغییر وضعیت عملیاتی راننده (قانون تجاری برای online) */
  async function updateOperationalStatus(driverId, newStatus) {
    if (!OPERATIONAL_STATUSES.includes(newStatus)) {
      return { error: 'Invalid operational status' };
    }
    const driver = await repository.findById(driverId);
    if (!driver) return { error: 'Driver not found' };

    // قانون تجاری: فقط راننده verified بدون مدارک منقضی می‌تواند online شود
    if (newStatus === 'online') {
      if (driver.accountStatus !== 'verified') {
        return {
          error: 'Cannot go online. Account status must be verified.',
          currentAccountStatus: driver.accountStatus,
        };
      }
      if (isExpired(driver.licenseExpiryDate)) {
        return { error: 'Cannot go online. Driving license has expired.' };
      }
      if (isExpired(driver.insuranceExpiryDate)) {
        return { error: 'Cannot go online. Insurance has expired.' };
      }
      if (isExpired(driver.registrationExpiryDate)) {
        return { error: 'Cannot go online. Vehicle registration has expired.' };
      }
    }

    return repository.updateOperationalStatus(
      driverId,
      newStatus,
      { lastSeenAt: newStatus === 'online' ? new Date() : null },
    );
  }

  /** به‌روزرسانی موقعیت مکانی راننده */
  async function updateLocation(driverId, latitude, longitude) {
    if (latitude == null || longitude == null) {
      return { error: 'latitude and longitude are required' };
    }
    const driver = await repository.findById(driverId);
    if (!driver) return { error: 'Driver not found' };
    return repository.updateLocation(driverId, latitude, longitude);
  }

  /** دریافت اطلاعات راننده */
  async function getDriverById(driverId) {
    return repository.findById(driverId);
  }

  /** دریافت پروفایل راننده بر اساس حساب کاربری احرازشده */
  async function getDriverByUserId(userId) {
    if (!userId) return null;
    return repository.findByUserId(userId);
  }


  /** دریافت لیست رانندگان */
  async function getAllDrivers() {
    return repository.findAll();
  }

  return {
    registerDriver,
    updateDriverAccountStatus,
    updateOperationalStatus,
    updateLocation,
    getDriverById,
    getDriverByUserId,
    getAllDrivers,
  };
}

const driverService = createDriverService();

module.exports = driverService;
module.exports.createDriverService = createDriverService;