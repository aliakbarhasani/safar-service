const app = require('./src/app');
const { connectDB } = require('./src/database/db');

const PORT = 3000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    console.warn('Starting server without DB connection (read-only mode)');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} (DB not connected)`);
    });
  });
