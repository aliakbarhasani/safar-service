/**
 * Presentation Layer Index
 *
 * Aggregates and exports the presentation layer modules.
 *
 * NOTE: the concrete files live directly under `presentation/`
 * (`PricingController.js`, `PricingRouter.js`) — there is no
 * `controllers/` / `routes/` sub-folder.
 *
 * Architecture: Clean Architecture - Presentation Layer
 */

const PricingController = require('./PricingController');
const createPricingRouter = require('./PricingRouter');

module.exports = { PricingController, createPricingRouter };