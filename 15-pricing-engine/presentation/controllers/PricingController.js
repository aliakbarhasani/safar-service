/**
 * PricingController - REST API Controller for Pricing Engine
 *
 * Handles HTTP requests for pricing operations.
 * All business logic is delegated to application use cases.
 * Returns standardized JSON responses.
 *
 * Architecture: Clean Architecture - Presentation Layer
 * Status: LOCKED | Created v2
 */
class PricingController {
  /**
   * @param {Object} deps
   * @param {import('../../application/useCases/GeneratePriceQuote')} deps.generateQuote
   * @param {import('../../application/useCases/RecalculatePrice')} [deps.recalculatePrice]
   * @param {import('../../application/useCases/ResolvePricingRule')} [deps.resolveRule]
   */
  constructor(deps) {
    if (!deps || !deps.generateQuote) {
      throw new Error('PricingController requires generateQuote use case');
    }
    this.generateQuote = deps.generateQuote;
    this.recalculatePrice = deps.recalculatePrice || null;
    this.resolveRule = deps.resolveRule || null;
  }

  /**
   * POST /api/v1/pricing/calculate
   * Simplified price calculation endpoint (returns total only)
   *
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @returns {Promise<Object>}
   */
  async calculatePrice(req, res) {
    try {
      const body = req.body || {};
      const { distanceKm, durationMin, serviceType, demandFactor } = body;

      if (!distanceKm && !durationMin) {
        return this._respond(res, 400, {
          success: false,
          status_code: 400,
          message: 'At least distanceKm or durationMin is required',
          data: null,
        });
      }

      const multiplierData = typeof demandFactor === 'number' && demandFactor !== 1.0
        ? [{ adapterKey: 'ai_demand', multiplier: demandFactor, reason: 'Dynamic demand' }]
        : [];

      const quote = await this.generateQuote.execute({
        tripRequestId: body.tripId || `calculate-${Date.now()}`,
        serviceType: serviceType || 'urban_taxi',
        scopeType: body.scopeType || 'City',
        scopeId: body.scopeId || 'default',
        distanceKm: Number(distanceKm || 10),
        durationMin: Number(durationMin || 15),
        currencyId: body.currencyId || 'IRT',
        multiplierData,
      });

      return this._respond(res, 200, {
        success: true,
        status_code: 200,
        message: 'Price calculated successfully',
        data: {
          totalPrice: quote.totalPrice,
          currencyId: quote.currencyId,
          breakdown: quote.priceBreakdown,
          quoteId: quote.id,
          expiresAt: quote.expiresAt,
        },
      });
    } catch (error) {
      return this._respond(res, 400, {
        success: false,
        status_code: 400,
        message: error.message || 'Failed to calculate price',
        data: null,
      });
    }
  }

  /**
   * POST /api/v1/pricing/quotes
   * Generate a new price quote
   *
   * @param {Object} req - Express-like request object
   * @param {Object} res - Express-like response object
   * @returns {Promise<Object>}
   */
  async createQuote(req, res) {
    try {
      const body = req.body || {};
      const { tripId, demandFactor } = body;

      if (!tripId) {
        return this._respond(res, 400, {
          success: false,
          status_code: 400,
          message: 'tripId is required',
          data: null,
        });
      }

      const multiplierData = typeof demandFactor === 'number' && demandFactor !== 1.0
        ? [{ adapterKey: 'ai_demand', multiplier: demandFactor, reason: 'Dynamic demand' }]
        : [];

      const quote = await this.generateQuote.execute({
        tripRequestId: tripId,
        serviceType: body.serviceType || 'urban_taxi',
        scopeType: body.scopeType || 'City',
        scopeId: body.scopeId || 'default',
        distanceKm: Number(body.distanceKm || 10),
        durationMin: Number(body.durationMin || 15),
        currencyId: body.currencyId || 'IRT',
        multiplierData,
      });

      return this._respond(res, 201, {
        success: true,
        status_code: 201,
        message: 'Price quote generated successfully',
        data: quote.snapshot(),
      });
    } catch (error) {
      return this._respond(res, 400, {
        success: false,
        status_code: 400,
        message: error.message || 'Failed to generate price quote',
        data: null,
      });
    }
  }

  /**
   * POST /api/v1/pricing/quotes/recalculate
   * Recalculate an existing price quote
   *
   * @param {Object} req
   * @param {Object} res
   * @returns {Promise<Object>}
   */
  async recalculateQuote(req, res) {
    try {
      if (!this.recalculatePrice) {
        return this._respond(res, 400, { success: false, message: 'Recalculation not available' });
      }

      const { originalQuoteId, ...updatedRequest } = req.body || {};

      if (!originalQuoteId) {
        return this._respond(res, 400, { success: false, message: 'originalQuoteId is required' });
      }

      const quote = await this.recalculatePrice.execute({ originalQuoteId, updatedRequest });

      return this._respond(res, 200, {
        success: true,
        message: 'Price recalculated successfully',
        data: quote.snapshot(),
      });
    } catch (error) {
      return this._respond(res, 400, {
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /api/v1/pricing/rules/resolve
   * Resolve the applicable pricing rule for a context
   *
   * @param {Object} req
   * @param {Object} res
   * @returns {Promise<Object>}
   */
  async resolveRule(req, res) {
    try {
      if (!this.resolveRule) {
        return this._respond(res, 400, { success: false, message: 'Rule resolution not available' });
      }

      const { scopeType, scopeId, serviceType } = req.query || {};

      if (!scopeType || !scopeId || !serviceType) {
        return this._respond(res, 400, {
          success: false,
          message: 'scopeType, scopeId, and serviceType are required',
        });
      }

      const rule = await this.resolveRule.execute({ scopeType, scopeId, serviceType });

      return this._respond(res, 200, {
        success: true,
        message: 'Pricing rule resolved successfully',
        data: rule,
      });
    } catch (error) {
      return this._respond(res, 400, {
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Standardized JSON response helper
   * @param {Object} res
   * @param {number} statusCode
   * @param {Object} data
   * @returns {Object}
   * @private
   */
  _respond(res, statusCode, data) {
    if (res && typeof res.status === 'function' && typeof res.json === 'function') {
      return res.status(statusCode).json(data);
    }
    return { statusCode, ...data, _isMock: true };
  }
}

module.exports = PricingController;