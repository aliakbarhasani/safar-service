# 06-trip-service | Trip Service (Snap-like)

## Responsibilities
- Trip management (city taxi, intercity)
- Core service (Snap-like Core)
- Fast trip reservation
- Driver and passenger management

## Communication with Modules
- Related to: 03-user-service (Users)
- Related to: 05-wallet-service (Wallet - balance check and cost deduction)
- Related to: 01-core-system (Events - TripCreated, TripFinished)

## Files
- `controllers/trip.controller.js` - Trip controller
- `services/trip.service.js` - Trip service
- `models/trip.model.js` - Trip model
- `routes/trip.route.js` - Trip routes (protected with auth middleware)