const config = require("@/config/app-config.json");

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || config.api?.baseUrl || "http://localhost:8000";

async function readApiResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const error = new Error(body?.error || body?.message || fallbackMessage);
    error.statusCode = response.status;
    error.code = body?.code || null;
    throw error;
  }
  return body;
}

function getRideCoordinates(rideData) {
  const pickupCoords = rideData?.pickupCoords;
  const dropoffCoords = rideData?.dropoffCoords;
  if (!pickupCoords || !dropoffCoords) {
    throw new Error("لطفاً مبدأ و مقصد را روی نقشه انتخاب کنید.");
  }

  const coordinates = [
    pickupCoords.lat, pickupCoords.lng, dropoffCoords.lat, dropoffCoords.lng,
  ].map(Number);
  if (coordinates.some((value) => !Number.isFinite(value))
    || coordinates[0] < -90 || coordinates[0] > 90
    || coordinates[2] < -90 || coordinates[2] > 90
    || coordinates[1] < -180 || coordinates[1] > 180
    || coordinates[3] < -180 || coordinates[3] > 180) {
    throw new Error("مختصات مبدأ یا مقصد معتبر نیست.");
  }

  return { pickupCoords, dropoffCoords, coordinates };
}

/**
 * Step 1: calculate and persist a server-side, coordinate-bound fare quote.
 * No trip is created here; the passenger can review the fare before confirming.
 */
async function estimateTaxiRide(rideData) {
  const { coordinates } = getRideCoordinates(rideData);
  const query = new URLSearchParams({
    originLat: String(coordinates[0]),
    originLng: String(coordinates[1]),
    destLat: String(coordinates[2]),
    destLng: String(coordinates[3]),
    serviceType: "urban_taxi",
  });

  const response = await fetch(
    `${API_BASE_URL}/api/v1/trip/estimate?${query.toString()}`,
    { method: "GET", credentials: "include", cache: "no-store" }
  );
  const estimate = await readApiResponse(response, "محاسبه قیمت ناموفق بود.");
  const quoteId = estimate?.data?.quoteId;
  const estimatedFare = Number(estimate?.data?.estimatedFare);
  if (!quoteId || !Number.isFinite(estimatedFare) || estimatedFare <= 0) {
    throw new Error("پیش‌فاکتور معتبر ساخته نشد؛ اتصال Redis یا سرویس قیمت‌گذاری را بررسی کنید.");
  }

  return {
    quoteId,
    estimatedFare,
    currency: estimate?.data?.currency || "IRT",
    distance: Number.isFinite(Number(estimate?.data?.distance)) ? Number(estimate.data.distance) : null,
    surgeMultiplier: Number.isFinite(Number(estimate?.data?.surgeMultiplier)) ? Number(estimate.data.surgeMultiplier) : null,
    expiresAt: estimate?.data?.expiresAt || null,
  };
}

/**
 * Step 2: create a trip only after the passenger has reviewed the quote.
 * The client never calculates or sends a trusted fare amount.
 */
async function requestTaxiRide(rideData) {
  const { coordinates } = getRideCoordinates(rideData);
  const quoteId = typeof rideData?.quoteId === "string" ? rideData.quoteId.trim() : "";
  if (!quoteId) {
    throw new Error("ابتدا کرایه را محاسبه کنید و سپس درخواست سفر را تأیید کنید.");
  }

  const tripResponse = await fetch(`${API_BASE_URL}/api/v1/trips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({
      quoteId,
      serviceType: "urban_taxi",
      originLat: coordinates[0],
      originLng: coordinates[1],
      destLat: coordinates[2],
      destLng: coordinates[3],
      originAddress: rideData.pickup || null,
      destinationAddress: rideData.dropoff || null,
    }),
  });
  const trip = await readApiResponse(tripResponse, "ثبت سفر ناموفق بود.");
  const rideId = trip?.data?.tripId || trip?.data?.rideId || trip?.data?.id;
  if (!rideId) {
    throw new Error("پاسخ سرور شناسه سفر ندارد؛ وضعیت ثبت سفر را از بخش سفرهای من بررسی کنید.");
  }

  return {
    success: true,
    message: trip?.message || "درخواست سفر با موفقیت ثبت شد.",
    rideId,
    quoteId,
    estimatedFare: rideData.estimatedFare,
    currency: rideData.currency || "IRT",
  };
}

module.exports = { estimateTaxiRide, requestTaxiRide };
