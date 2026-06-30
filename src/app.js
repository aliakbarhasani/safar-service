const express = require('express');
const indexRoute = require('./routes/index');
const healthRoute = require('./routes/health.route');

const app = express();

app.use(express.json());

app.use('/', indexRoute);
app.use('/api', healthRoute);

module.exports = app;
