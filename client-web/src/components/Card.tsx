import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "default" | "outline" | "elevated";
  padding?: "none" | "sm" | "md" | "lg";
}

const variantClasses: Record<NonNullable<CardProps["variant"]>, string> = {
  default: "bg-white border border-[#e2e8f0] rounded-2xl shadow-sm",
  outline: "bg-white border-2 border-[#e2e8f0] rounded-2xl",
  elevated: "bg-white rounded-2xl shadow-lg border border-[#e2e8f0]/60",
};

const paddingClasses: Record<NonNullable<CardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-8",
};

/**
 * Card — کامپوننت پایه UI Kit (RTL-aware via Tailwind logical props).
 * Container پایه با پرداخت سطح/حاشیه یکسان.
 */
export default function Card({
  children,
  variant = "default",
  padding = "md",
  className = "",
  ...props
}: CardProps) {
  return (
    <div
      className={`${variantClasses[variant]} ${paddingClasses[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}