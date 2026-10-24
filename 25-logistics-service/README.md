# Safar Service Logistics Boundary

This module is the first small, provider-neutral foundation for logistics capabilities inspired by Fleetbase: shipment lifecycle normalization, predictable status transitions, and a seam for later dispatch/tracking integration.

## Boundary decisions

- Safar Service owns customer identity, permissions, booking/payment truth, pricing, and financial ledger.
- The logistics adapter may own or synchronize operational shipment details, dispatch assignments, tracking events, and proof-of-delivery metadata once a reviewed integration is implemented.
- Do not copy Fleetbase's authentication, wallet/ledger, or customer identity into a second source of truth.
- Provider statuses are untrusted input. Normalize them through `normalizeProviderStatus`, then validate state changes through `transitionShipment`.
- This module is intentionally in-memory/pure logic only: it does not claim persistence, live tracking, dispatch, or Fleetbase API connectivity.

## Before connecting Fleetbase

1. Recheck the exact Fleetbase version, submodules, API contract, and applicable license/hosting obligations.
2. Implement a server-only adapter with credentials from environment/secret storage; never expose provider keys to the browser.
3. Authenticate and authorize every write in Safar Service before calling the adapter.
4. Add idempotency keys and durable event/outbox handling before processing webhooks or delivery/payment events.
5. Store provider identifiers separately from Safar shipment IDs; verify webhook signatures and deduplicate replayed events.
6. Add integration tests against a sandbox/stub API before enabling it for real orders.

## Tests

Run from repository root:

```sh
node --test 25-logistics-service/tests/shipment-status.test.js
```
