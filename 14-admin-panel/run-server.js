const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const AdminRouter = require('./presentation/routes/AdminRouter');
const errorHandler = require('./presentation/middlewares/ErrorHandlerMiddleware');
dotenv.config();
const app = express();
app.use(helmet()); app.use(cors()); app.use(express.json());
app.use('/', AdminRouter);
app.use('/api/v1/admin', AdminRouter);
app.use((req, res) => {
  res.status(404).json({ success: false, status_code: 404, code: 'NOT_FOUND',
    message: 'Route ' + req.method + ' ' + req.originalUrl + ' not found' });
});
app.use(errorHandler);
const port = process.env.PORT || 3002;
if (require.main === module) {
  app.listen(port, () => { console.log('[AdminPanel] Live on http://localhost:' + port); });
}
module.exports = app;
