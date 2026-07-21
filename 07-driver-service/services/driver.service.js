/**
 * driver.service.js - سرویس مستقل رانندگان
 * 
 * طبق اصول Clean Architecture:
 * - تمام منطق تجاری در لایه Service
 * - بدون Hardcode
 */

const Driver = require('../models/driver.model');
const { isDBConnected } = require('../../01-core-system/database/db');
const eventBus = require('../../01-core-system/EventBus');

const fallbackDrivers = [];

/**
 * ثبت‌نام اولیه راننده
 * accountStatus به صورت خودکار روی pending_verification قرار می‌گیرد
 */
async function registerDriver(data) {
  if (!data.firstName || !data.lastName || !data.phoneNumber) {
    return { error: 'firstName, lastName and phoneNumber are required' };
  }

  if (isDBConnected()) {
    const existing = await Driver.findOne({ phoneNumber: data.phoneNumber });
    if (existing) {
      return { error: 'Driver with this phone number already exists' };
    }

    const driver = new Driver({
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
      accountStatus: 'pending_verification',
      operationalStatus: 'offline',
      documents: data.documents || []
    });

    const saved = await driver.save();
    return saved.toObject();
  }

  // حالت fallback
  const existing = fallbackDrivers.find(d => d.phoneNumber === data.phoneNumber);
  if (existing) {
    return { error: 'Driver with this phone number already exists' };
  }

  const driver = {
    _id: new (require('mongoose').Types.ObjectId)().toString(),
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
    accountStatus: 'pending_verification',
    operationalStatus: 'offline',
    rating: 5.0,
    ratingCount: 0,
    completedTrips: 0,
    cancelledTrips: 0,
    currentLocation: { latitude: 0, longitude: 0 },
    lastSeenAt: null,
    documents: data.documents || [],
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null
  };
  fallbackDrivers.push(driver);
  return driver;
}

/**
 * تغییر وضعیت حساب راننده توسط ادمین
 */
async function updateDriverAccountStatus(driverId, newStatus, adminId) {
  const validStatuses = ['pending_verification', 'verified', 'rejected', 'suspended', 'blocked'];
  if (!validStatuses.includes(newStatus)) {
    return { error: 'Invalid driver account status' };
  }

  if (isDBConnected()) {
    const driver = await Driver.findById(driverId);
    if (!driver) return { error: 'Driver not found' };

    const previousStatus = driver.accountStatus;
    driver.accountStatus = newStatus;
    driver.updatedAt = new Date();
    const saved = await driver.save();

    eventBus.publish('DriverStatusChanged', {
      driverId: saved._id,
      previousStatus,
      newStatus,
      changedBy: adminId || 'system'
    });

    return saved.toObject();
  }

  const driver = fallbackDrivers.find(d => d._id.toString() === driverId.toString());
  if (!driver) return { error: 'Driver not found' };

  const previousStatus = driver.accountStatus;
  driver.accountStatus = newStatus;
  driver.updatedAt = new Date();

  eventBus.publish('DriverStatusChanged', {
    driverId: driver._id,
    previousStatus,
    newStatus,
    changedBy: adminId || 'system'
  });

  return driver;
}

/**
 * تغییر وضعیت عملیاتی راننده
 * 
 * قانون تجاری: راننده فقط در صورتی می‌تواند online شود که:
 * 1. accountStatus او verified باشد
 * 2. هیچ‌یک از تاریخ انقضای مدارکش نگذشته باشد
 */
async function updateOperationalStatus(driverId, newStatus) {
  const validStatuses = ['offline', 'online', 'busy', 'on_trip'];
  if (!validStatuses.includes(newStatus)) {
    return { error: 'Invalid operational status' };
  }

  if (isDBConnected()) {
    const driver = await Driver.findById(driverId);
    if (!driver) return { error: 'Driver not found' };

    // بررسی قانون تجاری برای رفتن به وضعیت online
    if (newStatus === 'online') {
      if (driver.accountStatus !== 'verified') {
        return {
          error: 'Cannot go online. Account status must be verified.',
          currentAccountStatus: driver.accountStatus
        };
      }

      const now = new Date();
      if (driver.licenseExpiryDate && new Date(driver.licenseExpiryDate) < now) {
        return { error: 'Cannot go online. Driving license has expired.' };
      }
      if (driver.insuranceExpiryDate && new Date(driver.insuranceExpiryDate) < now) {
        return { error: 'Cannot go online. Insurance has expired.' };
      }
      if (driver.registrationExpiryDate && new Date(driver.registrationExpiryDate) < now) {
        return { error: 'Cannot go online. Vehicle registration has expired.' };
      }
    }

    driver.operationalStatus = newStatus;
    driver.updatedAt = new Date();
    if (newStatus === 'online') {
      driver.lastSeenAt = new Date();
    }
    const saved = await driver.save();
    return saved.toObject();
  }

  const driver = fallbackDrivers.find(d => d._id.toString() === driverId.toString());
  if (!driver) return { error: 'Driver not found' };

  if (newStatus === 'online') {
    if (driver.accountStatus !== 'verified') {
      return {
        error: 'Cannot go online. Account status must be verified.',
        currentAccountStatus: driver.accountStatus
      };
    }

    const now = new Date();
    if (driver.licenseExpiryDate && new Date(driver.licenseExpiryDate) < now) {
      return { error: 'Cannot go online. Driving license has expired.' };
    }
    if (driver.insuranceExpiryDate && new Date(driver.insuranceExpiryDate) < now) {
      return { error: 'Cannot go online. Insurance has expired.' };
    }
    if (driver.registrationExpiryDate && new Date(driver.registrationExpiryDate) < now) {
      return { error: 'Cannot go online. Vehicle registration has expired.' };
    }
  }

  driver.operationalStatus = newStatus;
  driver.updatedAt = new Date();
  if (newStatus === 'online') {
    driver.lastSeenAt = new Date();
  }

  return driver;
}

/**
 * به‌روزرسانی موقعیت مکانی راننده
 */
async function updateLocation(driverId, latitude, longitude) {
  if (latitude == null || longitude == null) {
    return { error: 'latitude and longitude are required' };
  }

  if (isDBConnected()) {
    const driver = await Driver.findById(driverId);
    if (!driver) return { error: 'Driver not found' };

    driver.currentLocation = { latitude, longitude };
    driver.lastSeenAt = new Date();
    driver.updatedAt = new Date();
    const saved = await driver.save();
    return saved.toObject();
  }

  const driver = fallbackDrivers.find(d => d._id.toString() === driverId.toString());
  if (!driver) return { error: 'Driver not found' };

  driver.currentLocation = { latitude, longitude };
  driver.lastSeenAt = new Date();
  driver.updatedAt = new Date();

  return driver;
}

/**
 * دریافت اطلاعات راننده
 */
async function getDriverById(driverId) {
  if (isDBConnected()) {
    const driver = await Driver.findById(driverId).lean();
    return driver || null;
  }
  return fallbackDrivers.find(d => d._id.toString() === driverId.toString()) || null;
}

/**
 * دریافت لیست رانندگان
 */
async function getAllDrivers() {
  if (isDBConnected()) {
    return await Driver.find().lean();
  }
  return [...fallbackDrivers];
}

module.exports = {
  registerDriver,
  updateDriverAccountStatus,
  updateOperationalStatus,
  updateLocation,
  getDriverById,
  getAllDrivers
};