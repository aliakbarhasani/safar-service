"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, MapPin, Navigation, CheckCircle2, Loader2 } from "lucide-react";
import { requestTaxiRide } from "@/services/taxiService";

// Dynamic import for Leaflet map to avoid SSR issues
const InteractiveMap = dynamic(
  () => import("@/components/map/InteractiveMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-72 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
        در حال بارگذاری نقشه...
      </div>
    ),
  }
);

export default function TaxiPage() {
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [locationTarget, setLocationTarget] = useState("pickup");

  // States for API integration
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleLocationSelect = (lat, lng) => {
    const coords = { lat, lng };
    const label = `موقعیت انتخابی (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    if (locationTarget === "pickup") {
      setPickupCoords(coords);
      setPickup(label);
    } else {
      setDropoffCoords(coords);
      setDropoff(label);
    }
    if (statusMessage?.type === "error") setStatusMessage(null);
  };

  const handleSearchRide = async () => {
    // 1. Validation
    if (!pickupCoords) {
      setStatusMessage({ type: "error", text: "لطفاً دکمهٔ انتخاب مبدأ را بزنید و مبدأ را روی نقشه مشخص کنید." });
      return;
    }
    if (!dropoffCoords) {
      setStatusMessage({ type: "error", text: "لطفاً دکمهٔ انتخاب مقصد را بزنید و مقصد را روی نقشه مشخص کنید." });
      return;
    }

    // 2. Set Loading State
    setIsLoading(true);
    setStatusMessage(null);

    // 3. API Call
    try {
      const response = await requestTaxiRide({
        pickup: pickup,
        pickupCoords: pickupCoords,
        dropoff: dropoff,
        dropoffCoords: dropoffCoords,
      });

      if (response.success) {
        setStatusMessage({
          type: "success",
          text: `${response.message} (کد پیگیری: ${response.rideId})`,
        });
        // Optional: clear form after success
        // setDropoff("");
      }
    } catch (error) {
      setStatusMessage({
        type: "error",
        text: error instanceof Error
          ? error.message
          : "خطا در ثبت درخواست. لطفاً اتصال خود را بررسی کنید.",
      });
    } finally {
      // 4. Reset Loading State
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors">
            <ArrowRight className="w-6 h-6 text-gray-700" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">سامانه تاکسی اینترنتی</h1>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">انتخاب مبدأ و مقصد روی نقشه</h2>
          <p className="text-sm text-gray-500">ابتدا مبدأ یا مقصد را انتخاب کنید، سپس نقطهٔ آن را روی نقشه بزنید.</p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setLocationTarget("pickup")}
              className={`rounded-xl px-4 py-2 border font-medium transition-colors ${locationTarget === "pickup" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-gray-700 border-gray-300"}`}
            >
              انتخاب مبدأ
            </button>
            <button
              type="button"
              onClick={() => setLocationTarget("dropoff")}
              className={`rounded-xl px-4 py-2 border font-medium transition-colors ${locationTarget === "dropoff" ? "bg-teal-700 text-white border-teal-700" : "bg-white text-gray-700 border-gray-300"}`}
            >
              انتخاب مقصد
            </button>
            <span className="self-center text-sm text-gray-500">
              در حال انتخاب: {locationTarget === "pickup" ? "مبدأ" : "مقصد"}
            </span>
          </div>

          <InteractiveMap
            onLocationSelect={handleLocationSelect}
            pickupCoords={pickupCoords}
            dropoffCoords={dropoffCoords}
          />

          <div className="space-y-3 pt-2">
            <div className="relative">
              <span className="absolute right-3 top-3.5 text-blue-500">
                <MapPin className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={pickup}
                readOnly
                placeholder="مبدأ را از روی نقشه انتخاب کنید..."
                className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="relative">
              <span className="absolute right-3 top-3.5 text-red-500">
                <Navigation className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={dropoff}
                readOnly
                placeholder="مقصد را از روی نقشه انتخاب کنید..."
                className="w-full pr-10 pl-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status Message Display */}
          {statusMessage && (
            <div
              className={`p-4 rounded-xl text-sm font-medium transition-all ${
                statusMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {statusMessage.text}
            </div>
          )}

          <button
            onClick={handleSearchRide}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                در حال پردازش...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                جستجوی خودرو و راننده
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}