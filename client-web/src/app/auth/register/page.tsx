"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import config from "@/config/app-config.json";
import { isSupportedMobilePhone, normalizeMobilePhone } from "@/lib/phone";
import { registerUser } from "@/services/api";
import Button from "@/components/Button";
import Input from "@/components/Input";

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const normalizedPhone = normalizeMobilePhone(phoneNumber);

    if (!firstName.trim()) {
      newErrors.firstName = config.texts.auth.errors.required;
    }
    if (!lastName.trim()) {
      newErrors.lastName = config.texts.auth.errors.required;
    }
    if (!normalizedPhone) {
      newErrors.phoneNumber = config.texts.auth.errors.required;
    } else if (!isSupportedMobilePhone(normalizedPhone)) {
      newErrors.phoneNumber = config.texts.auth.errors.invalidPhone;
    }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      newErrors.email = config.texts.auth.errors.invalidEmail;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    try {
      // قرارداد بک‌اند پسورد را الزامی می‌داند؛ ورود واقعی از مسیر OTP است،
      // پس یک رمز تصادفی تولید می‌کنیم (فقط hash آن در DB ذخیره می‌شود).
      const generatedPassword =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : (() => {
              if (typeof globalThis.crypto?.getRandomValues !== "function") {
                throw new Error("Secure random generator is unavailable");
              }
              const bytes = new Uint8Array(24);
              globalThis.crypto.getRandomValues(bytes);
              return `pw-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
            })();
      await registerUser({
        phoneNumber: normalizeMobilePhone(phoneNumber),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        password: generatedPassword,
      });
      localStorage.setItem("login_phone", normalizeMobilePhone(phoneNumber));
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
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1e293b] mb-2">
          {config.texts.auth.registerTitle}
        </h1>
        <p className="text-center text-[#64748b] text-sm mb-8">
          {config.texts.auth.registerSubtitle}
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            type="text"
            label={config.texts.auth.firstNameLabel}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={errors.firstName}
          />

          <Input
            type="text"
            label={config.texts.auth.lastNameLabel}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={errors.lastName}
          />

          <Input
            type="tel"
            label={config.texts.auth.phoneLabel}
            placeholder={config.texts.auth.phonePlaceholder}
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            error={errors.phoneNumber}
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            dir="ltr"
          />

          <Input
            type="email"
            label={config.texts.auth.emailLabel}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            dir="ltr"
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
            {config.texts.auth.registerButton}
          </Button>
        </form>

        <p className="text-center text-sm text-[#64748b] mt-6">
          {config.texts.auth.loginLink}{" "}
          <Link
            href="/auth/login"
            className="text-[#0f766e] font-medium hover:underline"
          >
            {config.texts.auth.loginTitle}
          </Link>
        </p>
      </div>
    </div>
  );
}