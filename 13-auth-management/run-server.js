const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const AuthRouter = require('./presentation/routes/AuthRouter');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/v1/auth', AuthRouter);

const port = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Auth management API is live on http://localhost:${port}`);
  });
}

module.exports = app;
