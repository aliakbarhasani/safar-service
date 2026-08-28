"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Prevent closing on backdrop click (defaults to true; set true for confirm flows). */
  dismissable?: boolean;
}

/**
 * Modal — دیالوگ مودال RTL-aware با رعایت سادگی:
 * - فوکوس دار پشت (aria-modal / role=dialog)
 * - بستن با Escape (از طریق رویداد keydown)
 * - قفل اسکرول بدنه هنگام باز بودن
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {title && (
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#1e293b]">{title}</h2>
            {dismissable && (
              <button
                type="button"
                onClick={onClose}
                aria-label="بستن"
                className="text-[#64748b] hover:text-[#1e293b] text-2xl leading-none"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}