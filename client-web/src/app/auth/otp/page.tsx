"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import config from "@/config/app-config.json";
import { verifyOtp } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/Button";
import Input from "@/components/Input";

export default function OtpPage() {
  const router = useRouter();
  const { setAuth } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");

  useEffect(() => {
    const storedPhone = localStorage.getItem("login_phone");
    if (storedPhone) {
      setPhoneNumber(storedPhone);
    } else {
      router.replace("/auth/login");
    }
  }, [router]);

  // Persian digits to Latin digits for API
  const toEnglishDigits = (value: string) => {
    const faDigits = "۰۱۲۳۴۵۶۷۸۹";
    return value.replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d)));
  };

  const validateOtp = (code: string) => {
    return /^\d{5}$/.test(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setServerError("");

    const normalizedOtp = toEnglishDigits(otpCode).trim();

    if (!normalizedOtp) {
      setError(config.texts.auth.errors.required);
      return;
    }
    if (!validateOtp(normalizedOtp)) {
      setError(config.texts.auth.errors.invalidOtp);
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyOtp(phoneNumber, normalizedOtp);
      // Backend returns `{ data: { token, user } }` — read the `token` key only.
      const payload = result?.data || result || {};
      const token = payload?.token;
      if (token) {
        setAuth(token, payload?.user || null);
      }
      localStorage.removeItem("login_phone");
      router.replace("/dashboard");
    } catch (err: any) {
      if (err?.status === 429) {
        setServerError(config.texts.auth.errors.rateLimited);
      } else {
        setServerError(err?.message || config.texts.auth.errors.serverError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-[#1e40af] via-[#1e3a8a] to-[#0f172a] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1e40af] to-[#3b82f6] flex items-center justify-center shadow-lg">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1e293b] mb-2">
          {config.texts.auth.otpTitle}
        </h1>
        <p className="text-center text-[#64748b] text-sm mb-2">
          {config.texts.auth.otpSubtitle}
        </p>
        <p className="text-center text-[#64748b] text-xs mb-8">
          {config.texts.auth.otpSentTo.replace("{phone}", phoneNumber)}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            type="text"
            label={config.texts.auth.otpLabel}
            placeholder={config.texts.auth.otpPlaceholder}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value)}
            error={error}
            inputMode="numeric"
            maxLength={5}
            dir="ltr"
            className="text-center text-2xl tracking-[0.5em]"
          />

          {serverError && (
            <div className="bg-[#dc2626]/10 border border-[#dc2626]/30 text-[#dc2626] text-sm rounded-lg p-3">
              {serverError}
            </div>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            isLoading={isLoading}
          >
            {config.texts.auth.submitButton}
          </Button>
        </form>

        <p className="text-center text-sm text-[#64748b] mt-6">
          {config.texts.auth.resendOtp}{" "}
          <Link
            href="/auth/login"
            className="text-[#1e40af] font-medium hover:underline"
          >
            {config.texts.auth.sendOtpButton}
          </Link>
        </p>
      </div>
    </div>
  );
}