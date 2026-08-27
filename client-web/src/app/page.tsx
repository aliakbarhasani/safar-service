"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import config from "@/config/app-config.json";
import { getAuthToken } from "@/lib/auth";

export default function SplashPage() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
    const timer = setTimeout(() => {
      // Check if user is already logged in (cookie-first)
      const token = getAuthToken();
      if (token) {
        router.replace("/dashboard");
      } else {
        router.replace("/auth/login");
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-[#1e40af] via-[#1e3a8a] to-[#0f172a]">
      <div
        className={`text-center transition-all duration-700 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* App Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-xl">
          <svg
            className="w-14 h-14 text-white"
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

        {/* App Name */}
        <h1 className="text-3xl font-bold text-white mb-2">
          {config.app.name}
        </h1>
        <p className="text-lg text-white/70 mb-8">
          {config.texts.splash.subtitle}
        </p>

        {/* Loading Indicator */}
        <div className="flex justify-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:0ms]" />
          <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:150ms]" />
          <div className="w-2 h-2 rounded-full bg-white/60 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}