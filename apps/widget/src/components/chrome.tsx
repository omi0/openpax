import type { ComponentChildren } from "preact";
import { locale, setLocale, t } from "../i18n.js";

/* Small shared pieces: language pills, page header, step indicator, icons. */

export function LangToggle({ locales = ["it", "en"] }: { locales?: readonly string[] }) {
  if (locales.length < 2) return null;
  return (
    <div class="lang">
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale.value === l}
          onClick={() => setLocale(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function Header({
  title,
  subtitle,
  locales,
}: {
  title: string;
  subtitle?: string;
  locales?: readonly string[];
}) {
  return (
    <div class="head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p class="sub">{subtitle}</p> : null}
      </div>
      <LangToggle locales={locales} />
    </div>
  );
}

/** 1 Guests & date · 2 Time · 3 Details. `current` is 1-based; 4 means all done. */
export function Steps({ current }: { current: number }) {
  const labels = [t("steps.when"), t("steps.time"), t("steps.details")];
  return (
    <ol class="steps" aria-label={t("steps.label")}>
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <>
            {i > 0 ? <li key={`line-${n}`} class={`line ${done || active ? "done" : ""}`} /> : null}
            <li
              key={label}
              class={done ? "done" : active ? "active" : ""}
              aria-current={active ? "step" : undefined}
            >
              <span class="n">{done ? <CheckIcon /> : n}</span>
              <span class="t">{label}</span>
            </li>
          </>
        );
      })}
    </ol>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      aria-hidden="true"
    >
      <path
        d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8L12 2.6z" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" stroke-linecap="round" />
    </svg>
  );
}

export function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <path
        d="M6 3h12M6 21h12M7 3v4a5 5 0 0 0 5 5 5 5 0 0 0 5-5V3M7 21v-4a5 5 0 0 1 5-5 5 5 0 0 1 5 5v4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19" />
    </svg>
  );
}

/** Big round icon used on the "done" screens. */
export function DoneIcon({ kind = "check" }: { kind?: "check" | "wait" | "card" }) {
  return (
    <div class={`icon ${kind === "wait" ? "wait" : ""}`}>
      {kind === "wait" ? <HourglassIcon /> : kind === "card" ? <CardIcon /> : <CheckIcon />}
    </div>
  );
}

export function ErrorBox({ children }: { children: ComponentChildren }) {
  return (
    <div class="error" role="alert">
      <AlertIcon />
      <span>{children}</span>
    </div>
  );
}

export function Loading() {
  return (
    <div class="loading" aria-busy="true">
      <span class="spinner" />
    </div>
  );
}

/** "sab 12 set" style date for the compact summary bar. */
export function formatDateShort(date: string, loc: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

/** Booking code in a prominent dashed box; the `.code` element holds only the code. */
export function CodeBox({ code }: { code: string }) {
  return (
    <div class="code-box">
      <span class="code-label">{t("code")}</span>
      <strong class="code">{code}</strong>
    </div>
  );
}
