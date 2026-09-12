/**
 * DriverLocationUpdated.handler.js - Location Service Subscriber (P4-2)
 *
 * Event-Driven Architecture: ط³ط±ظˆغŒط³ WebSocket ط±ظˆغŒط¯ط§ط¯ `DriverLocationUpdated` ط±ط§
 * ط±ظˆغŒ EventBus ظ…ظ†طھط´ط± ظ…غŒâ€Œع©ظ†ط¯ (ط¨ط¯ظˆظ† ظپط±ط§ط®ظˆط§ظ†غŒ REST API). ط§غŒظ† ظ‡ظ†ط¯ظ„ط± ع¯ظˆط´ ظ…غŒâ€Œط¯ظ‡ط¯ ظˆ
 * ظ…ظˆظ‚ط¹غŒطھ ط±ط§ ط¯ط± Redis (GEO + Buffer) ط¨ظ‡â€Œط±ظˆط²ط±ط³ط§ظ†غŒ ظ…غŒâ€Œع©ظ†ط¯.
 *
 * ط±ط§ظ†ظ†ط¯ع¯ط§ظ† ط¯غŒع¯ط± ظ†غŒط§ط²غŒ ط¨ظ‡ ظپط±ط§ط®ظˆط§ظ†غŒ REST API ط¨ط±ط§غŒ ط§ط±ط³ط§ظ„ ظ„ظˆع©غŒط´ظ† ظ†ط¯ط§ط±ظ†ط¯ط› ع©ط§ظپغŒط³طھ
 * ط§ط² ط·ط±غŒظ‚ WebSocket ظ…ظˆظ‚ط¹غŒطھ ط®ظˆط¯ ط±ط§ ط§ط±ط³ط§ظ„ ع©ظ†ظ†ط¯.
 */

const eventBus = require('../../01-core-system/EventBus');

class DriverLocationUpdatedHandler {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.eventBus] - طھط²ط±غŒظ‚ EventBus ط¨ط±ط§غŒ طھط³طھ
   * @param {Object} [opts.locationService] - طھط²ط±غŒظ‚ locationService ط¨ط±ط§غŒ طھط³طھ
   */
  constructor({ eventBus: injectedBus = null, locationService = null } = {}) {
    // eslint-disable-next-line global-require
    this.eventBus = injectedBus || eventBus || require('../../01-core-system/EventBus');
    // eslint-disable-next-line global-require
    this.locationService = locationService || (() => {
      throw new Error('DriverLocationUpdatedHandler: locationService is required');
    })();
    this._registered = false;
    this._boundHandler = (data) => this.handle(data);
  }

  async handle(data = {}) {
    try {
      const driverId = data && data.driverId;
      const lat = data && data.latitude;
      const lng = data && data.longitude;
      if (!driverId || lat == null || lng == null) {
        return { updated: false, reason: 'missing_fields' };
      }
      await this.locationService.updateDriverLocation(driverId, lng, lat);
      return { updated: true, driverId };
    } catch (err) {
      console.error(`[LocationEventHandler] failed for driver ${data && data.driverId}:`, err.message);
      return { updated: false, reason: 'error', message: err.message };
    }
  }

  register() {
    if (!this._registered) {
      this.eventBus.on('DriverLocationUpdated', this._boundHandler);
      this._registered = true;
    }
    return this;
  }

  unregister() {
    if (this._registered) {
      this.eventBus.off('DriverLocationUpdated', this._boundHandler);
      this._registered = false;
    }
    return this;
  }
}

function registerDriverLocationUpdatedHandler(opts = {}) {
  return new DriverLocationUpdatedHandler(opts).register();
}

module.exports = { DriverLocationUpdatedHandler, registerDriverLocationUpdatedHandler };
