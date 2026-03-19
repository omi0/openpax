import { SETUP_STEPS, type SetupStatusDto, type SetupStep } from "@sitli/shared";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Frame of the setup guide: the list of steps with their progress on the
 * left (a progress bar on phones), the current step on the right, and a
 * footer for the navigation buttons. During onboarding there is no
 * restaurant yet, so `status` and `restaurantId` are null and the steps are
 * not links.
 */
export function SetupShell({
  current,
  status,
  restaurantId,
  title,
  children,
  footer,
}: {
  current: SetupStep;
  status: SetupStatusDto | null;
  restaurantId: string | null;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const index = SETUP_STEPS.indexOf(current);
  const total = SETUP_STEPS.length;
  const done = status?.done ?? 0;
  const isDone = (s: SetupStep) => status?.steps.find((x) => x.step === s)?.done ?? false;

  return (
    <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10">
      <aside className="mb-5 lg:mb-0">
        <p className="text-sm font-semibold text-brand-700">{t("setup.title")}</p>
        {/* phones: where we are, in one line */}
        <div className="mt-2 lg:hidden">
          <div className="flex items-center justify-between text-[13px] text-stone-500">
            <span>{t("setup.stepOf", { n: index + 1, total })}</span>
            <span>{t("setup.progress", { done, total })}</span>
          </div>
          <ProgressBar value={done} max={total} className="mt-1.5" />
        </div>
        <ol className="mt-3 hidden space-y-0.5 lg:block" aria-label={t("setup.title")}>
          {SETUP_STEPS.map((s, i) => {
            const stepDone = isDone(s);
            const active = s === current;
            const inner = (
              <>
                <span
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
                    stepDone && !active && "bg-brand-600 text-white",
                    active && "bg-brand-600 text-white ring-4 ring-brand-100",
                    !stepDone && !active && "bg-stone-200 text-stone-600",
                  )}
                >
                  {stepDone && !active ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[15px] font-medium",
                    active ? "text-stone-900" : "text-stone-600",
                  )}
                >
                  {t(`setup.steps.${s}.label`)}
                </span>
              </>
            );
            const cls = cn(
              "flex h-11 items-center gap-3 rounded-xl px-2.5",
              active && "bg-brand-50",
              restaurantId && !active && "hover:bg-stone-100",
            );
            return (
              <li key={s}>
                {restaurantId ? (
                  <Link
                    to="/r/$restaurantId/setup"
                    params={{ restaurantId }}
                    search={{ step: s }}
                    aria-current={active ? "step" : undefined}
                    className={cls}
                  >
                    {inner}
                  </Link>
                ) : (
                  <span aria-current={active ? "step" : undefined} className={cls}>
                    {inner}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </aside>

      <div className="min-w-0">
        <header>
          <p className="hidden text-sm font-medium text-stone-500 lg:block">
            {t("setup.stepOf", { n: index + 1, total })}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-[28px]">
            {title ?? t(`setup.steps.${current}.title`)}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-stone-500">
            {t(`setup.steps.${current}.hint`)}
          </p>
        </header>
        <div className="mt-5 space-y-4">{children}</div>
        {footer ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-stone-200", className)}
    >
      <div
        className="h-full rounded-full bg-brand-600 transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
