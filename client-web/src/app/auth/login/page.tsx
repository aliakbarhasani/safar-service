"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import config from "@/config/app-config.json";
import { isSupportedMobilePhone, normalizeMobilePhone } from "@/lib/phone";
import { requestOtp } from "@/services/api";
import Button from "@/components/Button";
import Input from "@/components/Input";

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [serverError, setServerError] = useState("");



  const validatePhone = (phone: string) => {
    return /^09\d{9}$/.test(phone);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setServerError("");

    const normalizedPhone = normalizeMobilePhone(phoneNumber);

    if (!normalizedPhone) {
      setError(config.texts.auth.errors.required);
      return;
    }
    if (!validatePhone(normalizedPhone)) {
      setError(config.texts.auth.errors.invalidPhone);
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestOtp(normalizedPhone);
      // Store phone number for OTP page
      localStorage.setItem("login_phone", normalizedPhone);
      router.push("/auth/otp");
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status === 429) {
        setServerError(config.texts.auth.errors.rateLimited);
      } else {
        setServerError(
          err?.message || err?.response?.data?.message || config.texts.auth.errors.serverError
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-[#0f766e] via-[#115e59] to-[#0f172a] p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#0f766e] to-[#14b8a6] flex items-center justify-center shadow-lg">
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
                d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1e293b] mb-2">
          {config.texts.auth.loginTitle}
        </h1>
        <p className="text-center text-[#64748b] text-sm mb-8">
          {config.texts.auth.loginSubtitle}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            type="tel"
            label={config.texts.auth.phoneLabel}
            placeholder={config.texts.auth.phonePlaceholder}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            error={error}
            inputMode="tel"
            maxLength={20}
            dir="ltr"
            autoComplete="tel"
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
            {config.texts.auth.sendOtpButton}
          </Button>
        </form>

        <p className="text-center text-sm text-[#64748b] mt-6">
          {config.texts.auth.registerLink}{" "}
          <Link
            href="/auth/register"
            className="text-[#0f766e] font-medium hover:underline"
          >
            {config.texts.auth.registerButton}
          </Link>
        </p>
      </div>
    </div>
  );
}