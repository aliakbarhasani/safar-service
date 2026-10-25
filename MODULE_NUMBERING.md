# Safar Service — Module Numbering Register

This register makes numbering gaps explicit so a missing number is not mistaken for a completed module. A directory with a reserved README is **not implemented functionality**.

| Number | Current status | Rule before implementation |
|---|---|---|
| 04 | Reserved — Route Service | Reconcile with location, mobility, and dispatch ownership first. |
| 06 | Reserved — Booking Service | Reconcile with mobility trip lifecycle and quote consumption first. |
| 11 | Reserved — Support Service | Reconcile with admin, notification, and audit capabilities first. |
| 12 | Reserved — Tour Service | Reuse shared identity, pricing, trip, and payment flows. |

Existing duplicate numeric prefixes (for example 09, 13, 14, and 17) are legacy naming collisions. Do not bulk-rename them: imports, scripts, deployment paths, and documentation may depend on current paths. A future path migration requires a separate dependency-aware change and compatibility plan.

## Database migration numbering

The migration sequence is authoritative in `00-infrastructure/database/migrations/run-all-migrations.js`, not inferred only from filenames. Migration `021` is intentionally not fabricated as a no-op: inserting a new migration between `020` and already-applied `022` can invalidate the runner's contiguous migration ledger on existing databases. If a real schema change is required, add a new forward migration after `036` and document the historical gap; never backfill a fake migration solely to make filenames look consecutive.
