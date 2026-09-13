/**
 * dispatch-workflow.test.js - Integration test for dispatch workflow
 * Mocks BullMQ and tests end-to-end flow
 */

// Mock bullmq before requiring modules
const mockAdd = jest.fn().mockResolvedValue({ id: "job-1" });
const mockRemoveJobs = jest.fn().mockResolvedValue();
const mockClose = jest.fn().mockResolvedValue();
const mockGetJobs = jest.fn().mockResolvedValue([]);

jest.mock("bullmq", () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: mockAdd,
      close: mockClose,
      getJobs: mockGetJobs
    })),
    Worker: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      close: mockClose
    }))
  };
}, { virtual: true });

const { DispatchQueue } = require("../infrastructure/DispatchQueue");
const { TripRequestedHandler } = require("../handlers/TripRequested.handler");
const { StopDispatchHandler } = require("../handlers/StopDispatch.handler");

describe("Dispatch Workflow - P8-1", () => {
  let mockEventBus;
  let mockLocationService;
  let mockDriverService;
  let dispatchQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEventBus = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn()
    };
    mockLocationService = {
      findNearbyDrivers: jest.fn().mockResolvedValue([
        { driverId: "driver-1", distance: 0.5 },
        { driverId: "driver-2", distance: 1.2 },
        { driverId: "driver-3", distance: 2.5 }
      ])
    };
    mockDriverService = {
      getDriverStatus: jest.fn().mockResolvedValue("AVAILABLE")
    };
    dispatchQueue = new DispatchQueue({
      redisConnection: { host: "localhost", port: 6379 },
      eventBus: mockEventBus,
      offerDelayMs: 15000
    });
  });

  test("schedules first offer immediately (no delay)", async () => {
    await dispatchQueue.scheduleOffer("trip-1", ["d1", "d2", "d3"], 0, 0);
    expect(mockAdd).toHaveBeenCalledWith(
      "driver-offer",
      { tripId: "trip-1", driverIds: ["d1", "d2", "d3"], currentIndex: 0 },
      expect.objectContaining({ delay: 0 })
    );
  });

  test("schedules next offer with 15s delay", async () => {
    await dispatchQueue.scheduleOffer("trip-1", ["d1", "d2", "d3"], 1, 15000);
    expect(mockAdd).toHaveBeenCalledWith(
      "driver-offer",
      { tripId: "trip-1", driverIds: ["d1", "d2", "d3"], currentIndex: 1 },
      expect.objectContaining({ delay: 15000 })
    );
  });

  test("TripRequested handler initiates dispatch with available drivers", async () => {
    const handler = new TripRequestedHandler({
      locationService: mockLocationService,
      driverService: mockDriverService,
      dispatchQueue,
      eventBus: mockEventBus,
      radiusKm: 3
    });

    await handler.handle({
      data: { tripId: "trip-123", originLat: 35.6892, originLng: 51.3890 }
    });

    expect(mockLocationService.findNearbyDrivers).toHaveBeenCalledWith(
      51.3890, 35.6892, 3
    );
    expect(mockAdd).toHaveBeenCalled();
  });

  test("TripRequested emits DispatchFailed when no drivers found", async () => {
    mockLocationService.findNearbyDrivers.mockResolvedValue([]);
    const handler = new TripRequestedHandler({
      locationService: mockLocationService,
      driverService: mockDriverService,
      dispatchQueue,
      eventBus: mockEventBus
    });

    await handler.handle({
      data: { tripId: "trip-404", originLat: 35.0, originLng: 51.0 }
    });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      "DispatchFailed",
      expect.objectContaining({ tripId: "trip-404", reason: "no_drivers_available" })
    );
  });

  test("StopDispatch removes jobs on DriverAccepted", async () => {
    const handler = new StopDispatchHandler({
      dispatchQueue,
      eventBus: mockEventBus
    });

    await handler.handle({
      data: { tripId: "trip-accepted", driverId: "driver-1" }
    });

    expect(mockGetJobs).toHaveBeenCalled();
  });

  test("StopDispatch removes jobs on TripCancelled", async () => {
    const handler = new StopDispatchHandler({
      dispatchQueue,
      eventBus: mockEventBus
    });

    await handler.handle({
      data: { tripId: "trip-cancelled", cancelledBy: "user-1" }
    });

    expect(mockGetJobs).toHaveBeenCalled();
  });

  test("DriverOffered event is published during job processing", async () => {
    await dispatchQueue.start();
    const processJob = dispatchQueue._processJob.bind(dispatchQueue);
    await processJob({
      data: { tripId: "trip-offer", driverIds: ["d1", "d2"], currentIndex: 0 }
    });

    expect(mockEventBus.emit).toHaveBeenCalledWith(
      "DriverOffered",
      expect.objectContaining({ tripId: "trip-offer", driverId: "d1", currentIndex: 0 })
    );
  });

  test("next driver job scheduled after current offer", async () => {
    await dispatchQueue.start();
    const processJob = dispatchQueue._processJob.bind(dispatchQueue);
    mockAdd.mockClear();
    await processJob({
      data: { tripId: "trip-next", driverIds: ["d1", "d2", "d3"], currentIndex: 0 }
    });

    // Should schedule next driver with delay
    expect(mockAdd).toHaveBeenCalledWith(
      "driver-offer",
      { tripId: "trip-next", driverIds: ["d1", "d2", "d3"], currentIndex: 1 },
      expect.objectContaining({ delay: 15000 })
    );
  });

  test("chain stops when no more drivers", async () => {
    await dispatchQueue.start();
    const processJob = dispatchQueue._processJob.bind(dispatchQueue);
    mockAdd.mockClear();
    await processJob({
      data: { tripId: "trip-last", driverIds: ["d1", "d2"], currentIndex: 1 }
    });

    // No more drivers after last one - should not schedule
    expect(mockAdd).not.toHaveBeenCalled();
  });
});