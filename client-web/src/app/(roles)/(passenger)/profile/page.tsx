"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import config from "@/config/app-config.json";
import { getProfile } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/Button";

interface ProfileData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  displayName?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { token, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const result = await getProfile();
        const data = result?.data || result;
        setProfile({
          firstName: data?.firstName || data?.name || "",
          lastName: data?.lastName || "",
          email: data?.email || "",
          phoneNumber: data?.phoneNumber || data?.phone || "",
        });
      } catch (err: any) {
        setError(
          err?.message || err?.response?.data?.message || config.texts.auth.errors.serverError
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [token, router]);

  const handleLogout = () => {
    logout();
    router.replace("/auth/login");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#f8fafc]">
        <div className="w-8 h-8 border-4 border-[#1e40af] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#f8fafc]">
      {/* Header */}
      <header className="bg-white border-b border-[#e2e8f0] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[#1e40af] font-medium hover:underline"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              style={{ transform: "scaleX(-1)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {config.texts.profile.backButton}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-[#1e293b]">{config.app.name}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            {config.texts.dashboard.logout}
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-8 max-w-4xl w-full mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-8">
          <h1 className="text-2xl font-bold text-[#1e293b] mb-6">
            {config.texts.profile.title}
          </h1>

          {error ? (
            <div className="bg-[#dc2626]/10 border border-[#dc2626]/30 text-[#dc2626] text-sm rounded-lg p-4">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1e40af] to-[#3b82f6] flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                  {profile?.firstName?.[0] || profile?.displayName?.[0] || "؟"}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[#1e293b]">
                    {profile?.firstName || ""} {profile?.lastName || ""}
                  </h2>
                  <p className="text-sm text-[#64748b]" dir="ltr">
                    {profile?.phoneNumber || ""}
                  </p>
                </div>
              </div>

              <div className="border-t border-[#e2e8f0] pt-4 space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span className="text-[#64748b] text-sm">
                    {config.texts.auth.firstNameLabel}
                  </span>
                  <span className="font-medium text-[#1e293b]">
                    {profile?.firstName || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-[#e2e8f0]">
                  <span className="text-[#64748b] text-sm">
                    {config.texts.auth.lastNameLabel}
                  </span>
                  <span className="font-medium text-[#1e293b]">
                    {profile?.lastName || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-[#e2e8f0]">
                  <span className="text-[#64748b] text-sm">
                    {config.texts.auth.phoneLabel}
                  </span>
                  <span className="font-medium text-[#1e293b]" dir="ltr">
                    {profile?.phoneNumber || "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-t border-[#e2e8f0]">
                  <span className="text-[#64748b] text-sm">
                    {config.texts.auth.emailLabel}
                  </span>
                  <span className="font-medium text-[#1e293b]" dir="ltr">
                    {profile?.email || "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}