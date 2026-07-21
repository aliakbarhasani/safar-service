/**
 * driver.model.js - مدل مستقل راننده (سرویس 07)
 * 
 * طبق استاندارد دیتابیس رابطه‌ای (PostgreSQL-ready):
 * - کلید اصلی UUID
 * - Soft Delete (deletedAt)
 * - فیلدهای audit (createdAt, updatedAt, deletedAt)
 * - تفکیک accountStatus و operationalStatus
 * - فیلدهای موقعیت مکانی (آماده برای PostGIS)
 * - تاریخ انقضای مدارک
 */

const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  type: { type: String, enum: ['identity_card', 'driving_license', 'vehicle_card', 'operation_permit', 'selfie'], required: true },
  url: { type: String, required: true },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: String, default: '' }
}, { _id: false });

const DriverSchema = new mongoose.Schema({
  _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
  dateOfBirth: { type: Date, required: true },
  address: { type: String, default: '' },

  // وضعیت حساب کاربری راننده
  accountStatus: {
    type: String,
    enum: ['pending_verification', 'verified', 'rejected', 'suspended', 'blocked'],
    default: 'pending_verification'
  },

  // وضعیت عملیاتی (آنلاین/آفلاین)
  operationalStatus: {
    type: String,
    enum: ['offline', 'online', 'busy', 'on_trip'],
    default: 'offline'
  },

  // فیلدهای آماری
  rating: { type: Number, default: 5.0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0 },
  completedTrips: { type: Number, default: 0 },
  cancelledTrips: { type: Number, default: 0 },

  // موقعیت مکانی (آماده برای PostGIS)
  currentLocation: {
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 }
  },
  lastSeenAt: { type: Date, default: null },

  // خودرو
  vehicleType: { type: String, required: true },
  licensePlate: { type: String, required: true },
  chassisNumber: { type: String, default: '' },

  // مدارک (URLها)
  identityCardUrl: { type: String, default: '' },
  selfieUrl: { type: String, default: '' },
  drivingLicenseUrl: { type: String, default: '' },
  transitPassUrl: { type: String, default: '' },
  vehicleCardUrl: { type: String, default: '' },

  // شماره‌ها
  licenseNumber: { type: String, required: true },
  vehicleIdentificationNumber: { type: String, required: true },
  identityCardNumber: { type: String, required: true },

  // تاریخ انقضای مدارک
  licenseExpiryDate: { type: Date, default: null },
  insuranceExpiryDate: { type: Date, default: null },
  registrationExpiryDate: { type: Date, default: null },

  // مدارک (آرایه)
  documents: { type: [DocumentSchema], default: [] },

  // فیلدهای Audit
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, default: null }
});

// Soft Delete middleware
DriverSchema.pre('find', function() {
  this.where({ deletedAt: null });
});
DriverSchema.pre('findOne', function() {
  this.where({ deletedAt: null });
});
DriverSchema.pre('countDocuments', function() {
  this.where({ deletedAt: null });
});

// به‌روزرسانی خودکار updatedAt
DriverSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('DriverV2', DriverSchema);