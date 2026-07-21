# 02-api-gateway | API Gateway

## Responsibilities
- Entry point for all requests
- Security control
- API version management
- Rate Limiting
- Routing to services
- Complete logging

## Communication with Modules
- No direct communication between modules
- All requests pass through this gateway

## Files
- `api.routes.js` - Centralized route management
- `routes/index.js` - Main routes
- `routes/health.route.js` - Health check routes
- `controllers/health.controller.js` - Health controller