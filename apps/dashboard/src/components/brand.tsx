import { cn } from "@/lib/utils";

/** The Sitli mark: a plate with a fork and knife, in brand green. */
export function BrandMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-sm",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="none">
        <title>Sitli</title>
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.4" opacity="0.7" />
        <path
          d="M4.2 3.2v6M2.8 3.2v3.2a1.4 1.4 0 0 0 2.8 0V3.2M4.2 9.2v11.6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          transform="translate(-1.2 0)"
        />
        <path
          d="M21 3.2c-1.6 1.4-2.2 3.5-2.2 6.1V20.8M18.8 9.3H21"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          transform="translate(1.2 0)"
        />
      </svg>
    </span>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={34} />
      <span className="text-lg font-bold tracking-tight text-stone-900">Sitli</span>
    </span>
  );
}
