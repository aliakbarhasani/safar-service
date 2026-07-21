# 05-wallet-service | Wallet Service

## Responsibilities
- User wallet management
- Financial transaction management (charge and deduct)
- Balance check and transaction validation
- Publishing financial events to EventBus

## Communication with Modules
- Related to: 03-user-service (Users - each user has a wallet)
- Related to: 01-core-system (EventBus - publishing WalletCharged, WalletDeducted events)
- Related to: 02-api-gateway (Central gateway - request routing)
- Related to: 04-auth-service (Security - authenticate middleware)

## Files
- `models/wallet.model.js` - Wallet model
- `models/transaction.model.js` - Transaction model
- `services/wallet.service.js` - Wallet service
- `controllers/wallet.controller.js` - Wallet controller
- `routes/wallet.route.js` - Wallet routes