const domain = require('./domain');
const application = require('./application');
const infrastructure = require('./infrastructure');
const presentation = require('./presentation');

module.exports = {
  domain,
  application,
  infrastructure,
  presentation,
  PricingController: presentation.PricingController,
  PricingRepository: infrastructure.PricingRepository,
};
