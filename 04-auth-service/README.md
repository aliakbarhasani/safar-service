# 04-auth-service | Authentication Service

## Responsibilities
- User authentication (Register/Login)
- JWT token management
- Multi-step verification
- Dynamic access control

## Communication with Modules
- Related to: 03-user-service (User - verification and storage)
- Related to: 01-core-system (EventBus - event publishing)
- Related to: 02-api-gateway (Central gateway - request routing)

## Files
- `controllers/auth.controller.js` - Auth controller
- `services/auth.service.js` - Auth service (Register, Login with JWT)
- `routes/auth.route.js` - Auth routes
- `middleware/auth.middleware.js` - Auth middleware for token verification