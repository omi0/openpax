import {
  Armchair,
  Ban,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Clock,
  Info,
  Loader2,
  TriangleAlert,
  UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------- cards */

export function Card({
  title,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  /** `flush` removes the body padding for lists and tables that run edge to edge. */
  flush,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card",
        className,
      )}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-stone-100 px-5 py-4">
          <div className="min-w-0 flex-1 basis-64">
            {title ? <h2 className="text-base font-semibold text-stone-900">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-sm leading-snug text-stone-500">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(flush ? "" : "px-5 py-4", bodyClassName)}>{children}</div>
      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/60 px-5 py-3">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}

/** Page title row: title, optional description, and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-sm font-medium text-brand-700 capitalize">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 md:text-[28px]">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[15px] text-stone-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------------- stats */

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "brand" | "good" | "bad" | "warn";
  className?: string;
}) {
  const iconTone = {
    neutral: "bg-stone-100 text-stone-600",
    brand: "bg-brand-50 text-brand-700",
    good: "bg-emerald-50 text-emerald-700",
    bad: "bg-red-50 text-red-700",
    warn: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5 shadow-card",
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]",
            iconTone,
          )}
        >
          {icon}
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-stone-500">{label}</p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight text-stone-900 tabular-nums">
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-[13px] leading-snug text-stone-500">{hint}</p> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- badges */

const badgeTones: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900",
  confirmed: "bg-emerald-100 text-emerald-900",
  seated: "bg-sky-100 text-sky-900",
  completed: "bg-stone-200 text-stone-700",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-rose-100 text-rose-800",
  neutral: "bg-stone-100 text-stone-700",
  brand: "bg-brand-50 text-brand-800",
  info: "bg-sky-100 text-sky-900",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-emerald-100 text-emerald-900",
  danger: "bg-red-100 text-red-800",
};

export function Badge({
  tone = "neutral",
  icon,
  size = "md",
  children,
  className,
}: {
  tone?: string;
  icon?: ReactNode;
  size?: "sm" | "md";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm"
          ? "px-2 py-0.5 text-xs [&_svg]:size-3"
          : "px-2.5 py-1 text-[13px] [&_svg]:size-3.5",
        badgeTones[tone] ?? badgeTones.neutral,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export const statusIcons: Record<string, ReactNode> = {
  pending: <Clock />,
  confirmed: <CircleCheck />,
  seated: <Armchair />,
  completed: <CheckCheck />,
  cancelled: <Ban />,
  no_show: <UserX />,
};

/** Booking status with a matching icon, so the state is readable without colour. */
export function StatusBadge({ status, size }: { status: string; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  return (
    <Badge tone={status} icon={statusIcons[status]} size={size}>
      {t(`today.status.${status}`)}
    </Badge>
  );
}

/* -------------------------------------------------------------------- alerts */

export function Alert({
  tone = "error",
  title,
  children,
  className,
}: {
  tone?: "error" | "success" | "info" | "warning";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const style = {
    error: { cls: "border-red-200 bg-red-50 text-red-900", Icon: CircleAlert },
    success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", Icon: CircleCheck },
    info: { cls: "border-sky-200 bg-sky-50 text-sky-900", Icon: Info },
    warning: { cls: "border-amber-200 bg-amber-50 text-amber-900", Icon: TriangleAlert },
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-3.5 py-3 text-sm", style.cls, className)}
    >
      <style.Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 leading-snug">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : ""}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-stone-400", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-16">
      <Spinner className="size-7" />
    </div>
  );
}

/* --------------------------------------------------------------- empty state */

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/60 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-3 inline-flex size-12 items-center justify-center rounded-2xl bg-white text-stone-400 shadow-card [&_svg]:size-6">
          {icon}
        </span>
      ) : null}
      {title ? <p className="text-base font-semibold text-stone-800">{title}</p> : null}
      {children ? (
        <div className={cn("max-w-md text-sm text-stone-500", title && "mt-1")}>{children}</div>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- avatar */

const avatarPalette = [
  "bg-rose-100 text-rose-800",
  "bg-orange-100 text-orange-800",
  "bg-amber-100 text-amber-800",
  "bg-lime-100 text-lime-800",
  "bg-emerald-100 text-emerald-800",
  "bg-teal-100 text-teal-800",
  "bg-sky-100 text-sky-800",
  "bg-indigo-100 text-indigo-800",
  "bg-violet-100 text-violet-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Coloured initials for a guest or team member. */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = avatarPalette[hash % avatarPalette.length];
  const dims = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" }[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        dims,
        color,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** Key/value line for detail panels. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2", className)}>
      <dt className="shrink-0 text-sm text-stone-500">{label}</dt>
      <dd className="min-w-0 text-right text-[15px] font-medium text-stone-900">{children}</dd>
    </div>
  );
}
