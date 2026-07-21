const express = require('express');
const cors = require('cors');
const config = require('../14-config-system/server.config');
const apiGateway = require('../02-api-gateway/api.routes');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

const app = express();

// Global middleware
app.use(cors({ origin: config.cors.origin }));
app.use(express.json());

// API Gateway - تنها نقطه ورود تمام درخواست‌ها (طبق بند ۷ سند مادر)
app.use('/', apiGateway);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;