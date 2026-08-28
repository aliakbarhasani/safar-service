interface LoadingProps {
  /** Label read by screen readers; invisible for sighted users (sr-only). */
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Render as a full-bleed centered block (common page state). */
  fullCenter?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-4",
  lg: "h-12 w-12 border-4",
};

/**
 * Loading â€” ط§ط³ظ¾غŒظ†ط± ظ†ط´ط§ظ†ع¯ط± ط¯ط± ط­ط§ظ„ ط¨ط§ط±ع¯ط°ط§ط±غŒ.
 * ط±ظ†ع¯/ط¶ط®ط§ظ…طھ ط¨ط± ط§ط³ط§ط³ ظ…طھط؛غŒط± ط³ط·ط­ (surface-aware) ظˆ ظ…ط¨طھظ†غŒ ط¨ط± Tailwind.
 */
export default function Loading({
  label,
  size = "md",
  fullCenter = false,
  className = "",
}: LoadingProps /* eslint-disable-line @typescript-eslint/no-use-before-define */) {
  const spinner = (
    <span
      role="status"
      aria-label={label ?? "ط¯ط± ط­ط§ظ„ ط¨ط§ط±ع¯ط°ط§ط±غŒ"}
      className="inline-flex items-center justify-center"
    >
      <svg
        className={`${sizeClasses[size]} animate-spin rounded-full border-[#1e40af] border-t-transparent`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );

  if (fullCenter) {
    return (
      <div className={`flex min-h-[12rem] items-center justify-center ${className}`}>
        {spinner}
      </div>
    );
  }
  return <span className={className}>{spinner}</span>;
}

