/**
 * DispatchQueue.js - BullMQ-based queue for ride offer dispatch
 * Handles sequential driver offers with delayed retries
 */

let Queue, Worker;
try {
  ({ Queue, Worker } = require("bullmq"));
} catch (e) {
  // Fallback no-op if bullmq not installed
  Queue = class { add() { return Promise.resolve(); } close() { return Promise.resolve(); } };
  Worker = class { on() {} close() { return Promise.resolve(); } };
}

const QUEUE_NAME = "ride-offers";
const DEFAULT_OFFER_DELAY_MS = 15000;
const DEFAULT_CONCURRENCY = 5;

class DispatchQueue {
  constructor({ redisConnection, eventBus, offerDelayMs = DEFAULT_OFFER_DELAY_MS, concurrency = DEFAULT_CONCURRENCY } = {}) {
    this.redisConnection = redisConnection;
    this.eventBus = eventBus;
    this.offerDelayMs = offerDelayMs;
    this.concurrency = concurrency;
    this.queueName = QUEUE_NAME;
    this.queue = null;
    this.worker = null;
    this._started = false;
  }

  async start() {
    if (this._started || !Queue || !Worker) return;
    this.queue = new Queue(this.queueName, { connection: this.redisConnection });
    this.worker = new Worker(
      this.queueName,
      async (job) => this._processJob(job),
      { connection: this.redisConnection, concurrency: this.concurrency }
    );
    this._started = true;
  }

  async _processJob(job) {
    const { tripId, driverIds, currentIndex = 0 } = job.data;
    if (!tripId || !driverIds || currentIndex >= driverIds.length) return;

    const currentDriver = driverIds[currentIndex];

    // Publish DriverOffered event
    if (this.eventBus) {
      this.eventBus.emit("DriverOffered", {
        tripId,
        driverId: currentDriver,
        currentIndex,
        totalDrivers: driverIds.length,
        timestamp: new Date().toISOString()
      });
    }

    // Schedule next driver if available
    if (currentIndex + 1 < driverIds.length) {
      await this.scheduleOffer(tripId, driverIds, currentIndex + 1, this.offerDelayMs);
    }
  }

  async scheduleOffer(tripId, driverIds, currentIndex = 0, delayMs = 0) {
    if (!this.queue) return;
    await this.queue.add(
      "driver-offer",
      { tripId, driverIds, currentIndex },
      { delay: delayMs, removeOnComplete: true, removeOnFail: true }
    );
  }

  async removeJobsByTripId(tripId) {
    if (!this.queue) return;
    const jobs = await this.queue.getJobs(["delayed", "waiting", "active"]);
    for (const job of jobs) {
      if (job.data && job.data.tripId === tripId) {
        await job.remove();
      }
    }
  }

  async close() {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    this._started = false;
  }
}

module.exports = { DispatchQueue, QUEUE_NAME, DEFAULT_OFFER_DELAY_MS };