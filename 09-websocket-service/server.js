/**
 * server.js - WebSocket Service Entry Point (P4-1)
 *
 * سرویس مستقل ارتباطات بلادرنگ با Socket.io و Redis Adapter.
 * این سرویس به صورت مستقل از API Gateway اجرا می‌شود و ارتباطات دوطرفه
 * بین سرور و کلاینت‌ها (مسافر، راننده) را مدیریت می‌کند.
 */

const http = require('http');
const { createIo } = require('./infrastructure/websocket/io');
const { registerConnectionHandlers } = require('./services/connection.service');
const { registerEventBridge } = require('./services/event-bridge.service');
const authMiddleware = require('./middlewares/auth.middleware');
const config = require('./config');

async function bootstrap() {
  const server = http.createServer();

  // ایجاد اینستنس Socket.io با Redis Adapter
  const io = createIo(server);

  // اعمال میدلور احراز هویت
  io.use(authMiddleware);

  // ثبت Connection Handlers
  registerConnectionHandlers(io);

  // اتصال Event Bus به WebSocket (Event Bridge)
  await registerEventBridge(io);

  // راه‌اندازی سرور
  server.listen(config.port, () => {
    console.log(`[WebSocket Service] listening on port ${config.port}`);
    console.log(`[WebSocket Service] environment: ${config.env}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[WebSocket Service] shutting down...');
    io.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return { server, io };
}

// اجرای مستقل (نه به عنوان ماژول)
if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[WebSocket Service] failed to start:', err);
    process.exit(1);
  });
}

module.exports = { bootstrap };
