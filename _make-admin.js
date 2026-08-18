const fs = require('fs');
const path = require('path');
const b = '14-admin-panel';

function w(r, c) {
  const fp = path.join(b, r);
  const d = path.dirname(fp);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(fp, c);
  console.log('  ✔', r);
}

// domain
w('domain/index.js', 'module.exports = {};\n');

// application
w('application/index.js', 'module.exports = {};\n');

// infrastructure
w('infrastructure/index.js', 'module.exports = {};\n');

// presentation - controller
w('presentation/controllers/AdminController.js', `class AdminController {
  getHealth(req, res) {
    return res.status(200).json({
      success: true, status_code: 200, module: 'admin-panel',
      version: '1.0.0', message: 'Admin Panel API is operational',
      timestamp: new Date().toISOString(),
    });
  }
  getRoot(req, res) {
    return res.status(200).json({
      success: true, status_code: 200, module: 'admin-panel',
      message: 'Safar Service Admin Panel',
      available_endpoints: [
        { path: '/health', method: 'GET', description: 'Health check' },
        { path: '/api/v1/admin/health', method: 'GET', description: 'API health check' },
      ],
    });
  }
}
module.exports = AdminController;
`);

// presentation - routes
w('presentation/routes/AdminRouter.js', `const express = require('express');
const AdminController = require('../controllers/AdminController');
const router = express.Router();
const ctrl = new AdminController();
router.get('/health', (req, res) => ctrl.getHealth(req, res));
router.get('/', (req, res) => ctrl.getRoot(req, res));
module.exports = router;
`);

// presentation - middleware
w('presentation/middlewares/ErrorHandlerMiddleware.js', `function errorHandlerMiddleware(err, req, res, next) {
  const sc = err.statusCode || 500;
  const msg = err.message || 'Unexpected error';
  console.error('[AdminPanel] Error', sc + ':', msg);
  return res.status(sc).json({
    success: false, status_code: sc,
    code: err.code || 'INTERNAL_ERROR', message: msg,
  });
}
module.exports = errorHandlerMiddleware;
`);

// run-server
w('run-server.js', `const express = require('express');
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
`);

// package.json
w('package.json', JSON.stringify({
  name: 'safar-admin-panel',
  version: '1.0.0',
  description: 'Safar Service Admin Panel',
  main: 'run-server.js',
  scripts: { start: 'node run-server.js' },
  dependencies: {
    cors: '^2.8.6',
    dotenv: '^17.4.2',
    express: '^4.18.2',
    helmet: '^8.0.0',
  },
  private: true,
}, null, 2) + '\n');

// .dockerignore
w('.dockerignore', 'node_modules\nnpm-debug.log\n.env\n.git\n.gitignore\n.vscode\n*.md\n.DS_Store\n');

// Dockerfile
w('Dockerfile', 'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json package-lock.json* ./\nRUN npm install --production\nCOPY . .\nEXPOSE 3002\nCMD ["node", "run-server.js"]\n');

console.log('\n✅ All 10 files created successfully.');