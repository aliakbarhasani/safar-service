# 01-core-system | Core System

## Responsibilities
- Main system infrastructure management
- Database connection management
- Error and log management
- Central EventBus (Pub/Sub)
- General middleware

## Communication with Modules
- All modules communicate with the core through EventBus and API Gateway
- No business logic exists in this module

## Files
- `server.js` - Main server entry point
- `app.js` - Express configuration
- `database/db.js` - Database connection
- `middleware/errorHandler.js` - Error handling
- `middleware/notFound.js` - Not found routes
- `EventBus.js` - Event-driven system core
