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
  const [selectedCoords, setSelectedCoords] = useState(null);

  // States for API integration
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleLocationSelect = (lat, lng) => {
    setSelectedCoords({ lat, lng });
    setPickup(`موقعیت انتخابی (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    // Clear error messages if the user starts interacting again
    if (statusMessage?.type === "error") setStatusMessage(null);
  };

  const handleSearchRide = async () => {
    // 1. Validation
    if (!selectedCoords) {
      setStatusMessage({ type: "error", text: "لطفاً مبدأ خود را از روی نقشه انتخاب کنید." });
      return;
    }
    if (!dropoff.trim()) {
      setStatusMessage({ type: "error", text: "لطفاً مقصد خود را وارد کنید." });
      return;
    }

    // 2. Set Loading State
    setIsLoading(true);
    setStatusMessage(null);

    // 3. API Call
    try {
      const response = await requestTaxiRide({
        pickup: pickup,
        pickupCoords: selectedCoords,
        dropoff: dropoff,
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
          <p className="text-sm text-gray-500">برای تعیین مبدأ، روی نقطه مورد نظر در نقشه زیر کلیک کنید.</p>

          <InteractiveMap onLocationSelect={handleLocationSelect} />

          <div className="space-y-3 pt-2">
            <div className="relative">
              <span className="absolute right-3 top-3.5 text-blue-500">
                <MapPin className="w-5 h-5" />
              </span>
              <input
                type="text"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder="مبدأ خود را انتخاب یا وارد کنید..."
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
                onChange={(e) => {
                  setDropoff(e.target.value);
                  if (statusMessage?.type === "error") setStatusMessage(null);
                }}
                placeholder="مقصد خود را وارد کنید..."
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