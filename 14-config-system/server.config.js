const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  env: process.env.NODE_ENV || 'development',
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safar-service',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  pg: {
    host: process.env.PG_HOST || '127.0.0.1',
    port: parseInt(process.env.PG_PORT, 10) || 5432,
    database: process.env.PG_DATABASE || 'safar_service',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    max: parseInt(process.env.PG_POOL_MAX, 10) || 20,
    idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT, 10) || 30000,
    connectionTimeoutMillis: parseInt(process.env.PG_CONNECTION_TIMEOUT, 10) || 5000,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },
  api: {
    prefix: '/api/v1',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'safar-service-jwt-secret-key-2026',
    expiration: process.env.JWT_EXPIRATION || '7d',
  },
  wallet: {
    currency: process.env.WALLET_CURRENCY || 'IRT',
    // حساب متعلق به پلتفرم که کمیسیون سفرها به آن واریز میشود (P5-1)
    platformUserId: process.env.WALLET_PLATFORM_USER_ID || 'system-platform',
  },
  trip: {
    defaultCost: parseInt(process.env.TRIP_DEFAULT_COST, 10) || 50000,
    // مبلغ ورودی ثابت (base fare) محاسبه قیمت نهایی — P6-1
    baseFare: parseInt(process.env.TRIP_BASE_FARE, 10) || 15000,
    // نرخ سرانه هر کیلومتر برای محاسبه ساده کرایه نهایی (`EndTripUseCase`)
    perKmRate: parseFloat(process.env.TRIP_PER_KM_RATE) || 2000,
    commissionRates: {
      urban_taxi: parseFloat(process.env.COMMISSION_URBAN_TAXI) || 10,
      intercity_taxi: parseFloat(process.env.COMMISSION_INTERCITY_TAXI) || 7,
      freight: parseFloat(process.env.COMMISSION_FREIGHT) || 5,
      delivery: parseFloat(process.env.COMMISSION_DELIVERY) || 12,
      // کمیسیون عمومی/پیشفرض سیستم (۱۵٪ در صورت عدم ورود صریح)
      general: parseFloat(process.env.COMMISSION_GENERAL) || 15,
    },
  },
};

module.exports = config;
