const { EventEmitter } = require('events');
const express = require('express');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const logger = require('./infrastructure/logging/Logger');
const TripRouter = require('./presentation/routes/TripRouter');
const UpdateTripStatus = require('./core/use-cases/UpdateTripStatus');
const swaggerSpec = require('./presentation/docs/swagger');
const tripController = TripRouter.tripController;
const errorHandlerMiddleware = require('./presentation/middlewares/ErrorHandlerMiddleware');
const SocketServer = require('./infrastructure/websocket/SocketServer');

let helmet;
try {
  helmet = require('helmet');
} catch (error) {
  helmet = () => (req, res, next) => next();
}

let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch (error) {
  rateLimit = (options = {}) => {
    const windowMs = options.windowMs || 15 * 60 * 1000;
    const max = options.max || 100;
    const message = options.message || {
      success: false,
      status_code: 429,
      message: 'Too many requests from this IP, please try again after 15 minutes.',
    };

    return (req, res, next) => {
      const now = Date.now();
      const key = req.ip || 'global';
      const entry = req.app.locals.rateLimitState || (req.app.locals.rateLimitState = new Map());
      const current = entry.get(key) || { count: 0, resetAt: now + windowMs };

      if (now > current.resetAt) {
        current.count = 0;
        current.resetAt = now + windowMs;
      }

      current.count += 1;
      entry.set(key, current);

      if (current.count > max) {
        return res.status(429).json(message);
      }

      return next();
    };
  };
}

let morgan;
try {
  morgan = require('morgan');
} catch (error) {
  morgan = () => (req, res, next) => next();
}

const app = express();
const tripRepository = TripRouter.tripRepository;
const DriverMatchingSubscriber = (() => {
  try {
    return require('./infrastructure/subscribers/DriverMatchingSubscriber');
  } catch (e) {
    return null;
  }
})();
const NotificationSubscriber = (() => {
  try {
    return require('./infrastructure/subscribers/NotificationSubscriber');
  } catch (e) {
    return null;
  }
})();
const eventEmitter = new EventEmitter();
const serializePayload = (payload) => {
  if (payload instanceof Error) {
    return {
      message: payload.message,
      stack: payload.stack,
    };
  }

  if (payload === null || payload === undefined) {
    return payload;
  }

  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (error) {
    return String(payload);
  }
};

const originalEmit = eventEmitter.emit.bind(eventEmitter);

eventEmitter.emit = (eventName, payload) => {
  if (typeof eventName === 'string' && eventName.startsWith('trip.status.')) {
    logger.info('Domain event emitted', {
      eventName,
      payload: serializePayload(payload),
    });
  }

  return originalEmit(eventName, payload);
};

app.locals.logger = logger;
app.locals.eventEmitter = eventEmitter;

// Initialize DriverMatchingSubscriber if available (decoupled)
try {
  if (DriverMatchingSubscriber) {
    const updateTripStatusUseCase = new UpdateTripStatus(tripRepository, eventEmitter);
    new DriverMatchingSubscriber({ eventEmitter, logger, updateTripStatusUseCase });
    logger.info('DriverMatchingSubscriber initialized');
  } else {
    logger.info('DriverMatchingSubscriber not present, skipping initialization');
  }
} catch (err) {
  logger.error('Failed to initialize DriverMatchingSubscriber', { error: err && err.stack ? err.stack : err });
}

try {
  if (NotificationSubscriber) {
    new NotificationSubscriber({ eventEmitter, logger });
    logger.info('NotificationSubscriber initialized');
  } else {
    logger.info('NotificationSubscriber not present, skipping initialization');
  }
} catch (err) {
  logger.error('Failed to initialize NotificationSubscriber', { error: err && err.stack ? err.stack : err });
}

app.use(helmet());
app.use(express.json());
app.use(morgan('combined', { stream: logger.stream }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      status_code: 429,
      message: 'Too many requests from this IP, please try again after 15 minutes.',
    });
  },
});

app.get('/health', (req, res) => tripController.getHealth(req, res));
app.get('/api/v1/health', (req, res) => tripController.getHealth(req, res));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1/trips', limiter, TripRouter);

app.use((req, res, next) => {
  const err = new Error('Route not found.');
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  next(err);
});

app.use(errorHandlerMiddleware);

const port = process.env.PORT || 3000;

if (require.main === module) {
  const server = http.createServer(app);
  new SocketServer(server);

  server.listen(port, () => {
    logger.info(`Trip Management API server is live on http://localhost:${port}`);
  });

  server.on('error', (error) => {
    logger.error('Server startup failed', { error: error && error.stack ? error.stack : error });
  });
}

module.exports = app;
