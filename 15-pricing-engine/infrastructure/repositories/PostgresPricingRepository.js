// Re-export shim — original module archived to _legacy_archive.
// Consumers (index.js, infrastructure/index.js, tests) keep loading unchanged.
module.exports = require('../../_legacy_archive/infrastructure/repositories/PostgresPricingRepository.js');