"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, MapPin, Navigation, CheckCircle2, Loader2 } from "lucide-react";
import { estimateTaxiRide, requestTaxiRide } from "@/services/taxiService";

type Coordinates = { lat: number; lng: number };
type StatusMessage = { type: "success" | "error"; text: string; requiresLogin?: boolean } | null;
type FareQuote = { quoteId: string; estimatedFare: number; currency: string; distance: number | null; surgeMultiplier: number | null; expiresAt: string | null };

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
  const [pickupCoords, setPickupCoords] = useState<Coordinates | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<Coordinates | null>(null);
  const [locationTarget, setLocationTarget] = useState<"pickup" | "dropoff">("pickup");

  // States for API integration
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"estimate" | "booking" | null>(null);
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null);

  const handleLocationSelect = (lat: number, lng: number) => {
    const coords = { lat, lng };
    const label = `موقعیت انتخابی (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    const hadQuote = Boolean(fareQuote);
    if (locationTarget === "pickup") {
      setPickupCoords(coords);
      setPickup(label);
    } else {
      setDropoffCoords(coords);
      setDropoff(label);
    }
    // A quote is bound to exact coordinates; changing either point invalidates it.
    setFareQuote(null);
    setStatusMessage(hadQuote
      ? { type: "error", text: "مبدأ یا مقصد تغییر کرد؛ قیمت قبلی باطل شد. دوباره کرایه را محاسبه کنید." }
      : statusMessage?.type === "error" ? null : statusMessage);
  };

  const validateRoute = () => {
    if (!pickupCoords) {
      setStatusMessage({ type: "error", text: "لطفاً دکمهٔ انتخاب مبدأ را بزنید و مبدأ را روی نقشه مشخص کنید." });
      return false;
    }
    if (!dropoffCoords) {
      setStatusMessage({ type: "error", text: "لطفاً دکمهٔ انتخاب مقصد را بزنید و مقصد را روی نقشه مشخص کنید." });
      return false;
    }
    return true;
  };

  const handleEstimateFare = async () => {
    if (!validateRoute()) return;

    setIsLoading(true);
    setLoadingAction("estimate");
    setStatusMessage(null);
    try {
      const quote = await estimateTaxiRide({ pickupCoords, dropoffCoords });
      setFareQuote(quote);
      setStatusMessage({
        type: "success",
        text: "پیش‌فاکتور آماده است. مبلغ را بررسی کنید و فقط در صورت تأیید، درخواست سفر را ثبت کنید.",
      });
    } catch (error) {
      setFareQuote(null);
      setStatusMessage({
        type: "error",
        text: error instanceof Error ? error.message : "محاسبه کرایه ناموفق بود؛ لطفاً دوباره تلاش کنید.",
      });
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const handleConfirmRide = async () => {
    if (!validateRoute()) return;
    if (!fareQuote) {
      setStatusMessage({ type: "error", text: "ابتدا کرایه را محاسبه کنید." });
      return;
    }

    setIsLoading(true);
    setLoadingAction("booking");
    setStatusMessage(null);
    try {
      const response = await requestTaxiRide({
        pickup,
        pickupCoords,
        dropoff,
        dropoffCoords,
        quoteId: fareQuote.quoteId,
        estimatedFare: fareQuote.estimatedFare,
        currency: fareQuote.currency,
      });
      setStatusMessage({
        type: "success",
        text: `${response.message} (کد پیگیری: ${response.rideId})`,
      });
    } catch (error) {
      const statusCode = error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (statusCode === 410) {
        setFareQuote(null);
        setStatusMessage({ type: "error", text: "اعتبار پیش‌فاکتور تمام شده است؛ لطفاً کرایه را دوباره محاسبه کنید." });
      } else if (statusCode === 401) {
        setStatusMessage({
          type: "error",
          text: "برای ثبت سفر ابتدا وارد حساب کاربری شوید.",
          requiresLogin: true,
        });
      } else {
        setStatusMessage({
          type: "error",
          text: error instanceof Error ? error.message : "خطا در ثبت درخواست؛ لطفاً دوباره تلاش کنید.",
        });
      }
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
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
              {statusMessage.requiresLogin && (
                <Link href="/auth/login" className="mr-2 inline-flex font-bold underline underline-offset-4">
                  ورود / ثبت‌نام
                </Link>
              )}
            </div>
          )}

          {fareQuote && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2" aria-live="polite">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-amber-900">کرایه برآوردی</p>
                  <p className="mt-1 text-2xl font-extrabold text-slate-900">
                    {new Intl.NumberFormat("fa-IR").format(fareQuote.estimatedFare)}{" "}
                    {fareQuote.currency === "IRT" ? "تومان" : fareQuote.currency}
                  </p>
                </div>
                <span className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-amber-900">پیش‌فاکتور</span>
              </div>
              {fareQuote.distance !== null && (
                <p className="text-sm text-slate-600">
                  فاصلهٔ تقریبی: {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(fareQuote.distance)} کیلومتر
                </p>
              )}
              {fareQuote.expiresAt && (
                <p className="text-xs text-slate-500">
                  اعتبار پیش‌فاکتور تا {new Date(fareQuote.expiresAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <p className="text-xs leading-6 text-slate-600">
                تا زمانی که تأیید نکنید، سفری ثبت نمی‌شود. اگر مبدأ یا مقصد را تغییر دهید، باید کرایهٔ تازه بگیرید.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={fareQuote ? handleConfirmRide : handleEstimateFare}
              disabled={isLoading}
              className="w-full bg-teal-700 hover:bg-teal-800 disabled:bg-teal-400 text-white font-medium py-3 rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {loadingAction === "estimate" ? "در حال محاسبه کرایه..." : "در حال ثبت درخواست..."}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  {fareQuote ? "تأیید کرایه و ثبت درخواست سفر" : "محاسبه کرایه"}
                </>
              )}
            </button>
            {fareQuote && (
              <button
                type="button"
                onClick={handleEstimateFare}
                disabled={isLoading}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                محاسبهٔ مجدد
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}