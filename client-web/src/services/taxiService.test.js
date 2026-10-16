const { estimateTaxiRide, requestTaxiRide } = require('./taxiService');

const ride = {
  pickup: 'مبدأ آزمایشی',
  pickupCoords: { lat: 35.7, lng: 51.3 },
  dropoff: 'مقصد آزمایشی',
  dropoffCoords: { lat: 35.71, lng: 51.31 },
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('taxi fare confirmation API contract', () => {
  test('estimating a fare creates a quote but does not create a trip', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          quoteId: 'quote-123',
          estimatedFare: 42000,
          distance: 13.2,
          surgeMultiplier: 1,
          expiresAt: '2026-10-16T13:10:00.000Z',
        },
      }),
    });

    const quote = await estimateTaxiRide(ride);

    expect(quote).toMatchObject({
      quoteId: 'quote-123',
      estimatedFare: 42000,
      currency: 'IRT',
      distance: 13.2,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(String(url)).toContain('/api/v1/trip/estimate?');
    expect(options.method).toBe('GET');
    expect(String(url)).toContain('originLat=35.7');
    expect(String(url)).toContain('destLat=35.71');
    expect(String(url)).not.toContain('/api/v1/trips');
  });

  test('trip creation refuses to call the API without an explicit quote ID', async () => {
    await expect(requestTaxiRide(ride)).rejects.toThrow('ابتدا کرایه را محاسبه کنید');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('trip creation sends the server quote ID, not a client-calculated fare', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: { tripId: 'trip-456', status: 'REQUESTED' },
      }),
    });

    const result = await requestTaxiRide({
      ...ride,
      quoteId: 'quote-123',
      estimatedFare: 42000,
      currency: 'IRT',
    });

    expect(result).toMatchObject({ success: true, rideId: 'trip-456', quoteId: 'quote-123' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/api/v1/trips');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    const body = JSON.parse(options.body);
    expect(body.quoteId).toBe('quote-123');
    expect(body).not.toHaveProperty('estimatedFare');
    expect(body).not.toHaveProperty('finalFare');
  });

  test('expired quote errors retain the HTTP status and public error code', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({
        success: false,
        code: 'QUOTE_EXPIRED',
        error: 'پیش‌فاکتور منقضی شده است.',
      }),
    });

    await expect(requestTaxiRide({ ...ride, quoteId: 'expired-quote' })).rejects.toMatchObject({
      statusCode: 410,
      code: 'QUOTE_EXPIRED',
    });
  });
});
