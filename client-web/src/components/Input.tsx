"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export default function Input({
  label,
  error,
  fullWidth = true,
  className = "",
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className={`${fullWidth ? "w-full" : ""} ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-[#1e293b] mb-1"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-4 py-2.5 rounded-lg border text-[#1e293b] placeholder-[#94a3b8] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent ${
          error
            ? "border-[#dc2626] focus:ring-[#dc2626]"
            : "border-[#e2e8f0] hover:border-[#94a3b8]"
        }`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-[#dc2626]">{error}</p>
      )}
    </div>
  );
}