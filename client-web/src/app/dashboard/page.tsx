"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import config from "@/config/app-config.json";
import Button from "@/components/Button";

export default function DashboardPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/auth/login");
      return;
    }

    // Read user info from localStorage for greeting (no business logic here)
    try {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        setUsername(user?.firstName || user?.name || "");
      }
    } catch {
      // ignore parse errors
    }

    setIsChecking(false);
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    router.replace("/auth/login");
  };

  if (isChecking) {
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1e40af] to-[#3b82f6] flex items-center justify-center shadow">
            <svg
              className="w-6 h-6 text-white"
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
          <span className="font-bold text-[#1e293b]">{config.app.name}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          {config.texts.dashboard.logout}
        </Button>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-8 max-w-4xl w-full mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e2e8f0] p-8">
          <h1 className="text-2xl font-bold text-[#1e293b] mb-2">
            {config.texts.dashboard.welcome}
            {username && `، ${username}`}
          </h1>
          <p className="text-[#64748b] mb-6">
            {config.texts.dashboard.title}
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/profile"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#1e40af] text-white font-medium hover:bg-[#1e3a8a] transition-all duration-200 shadow-sm"
            >
              {config.texts.dashboard.profileLink}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}