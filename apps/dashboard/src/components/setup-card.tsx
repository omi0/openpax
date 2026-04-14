import type { SetupStatusDto } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ProgressBar } from "@/components/setup-shell";
import { Button, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { setupQuery } from "@/lib/queries";

/**
 * Progress of the setup guide. On Today it nags (politely) until the owner
 * finishes or hides it; on the settings hub it stays as the way back in.
 */
export function SetupProgressCard({
  restaurantId,
  role,
  variant,
}: {
  restaurantId: string;
  role: string;
  variant: "today" | "hub";
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const status = useQuery({ ...setupQuery(restaurantId), enabled: role !== "staff" });
  const hide = useMutation({
    mutationFn: () =>
      api.patch<SetupStatusDto>(`/api/v1/restaurants/${restaurantId}/setup`, { completed: true }),
    onSuccess: (data) => queryClient.setQueryData(setupQuery(restaurantId).queryKey, data),
    onError: () => toast.error(t("app.error")),
  });
  if (role === "staff" || !status.data) return null;
  const s = status.data;
  if (variant === "today" && s.completedAt) return null;
  const nextStep = s.steps.find((x) => !x.done)?.step;
  const finished = Boolean(s.completedAt);

  return (
    <section
      aria-label={t("setup.title")}
      className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-4 shadow-card"
    >
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        {finished ? <CircleCheck className="size-5" /> : <Rocket className="size-5" />}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-base font-semibold text-stone-900">
          {variant === "hub" ? t("setup.hubTitle") : t("setup.cardTitle")}
        </p>
        <p className="mt-0.5 text-sm text-stone-600">
          {finished && s.completedAt
            ? t("setup.hubCompleted", {
                date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(
                  new Date(s.completedAt),
                ),
              })
            : variant === "hub"
              ? t("setup.hubHint")
              : t("setup.cardHint")}
        </p>
        {!finished ? (
          <div className="mt-2.5 flex items-center gap-3">
            <ProgressBar value={s.done} max={s.total} className="max-w-xs" />
            <span className="shrink-0 text-[13px] font-medium text-stone-600 tabular-nums">
              {t("setup.progress", { done: s.done, total: s.total })}
            </span>
          </div>
        ) : null}
        {!finished && nextStep ? (
          <p className="mt-1.5 text-[13px] text-stone-500">
            {t("setup.next", { step: t(`setup.steps.${nextStep}.label`) })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {variant === "today" ? (
          <Button variant="ghost" size="sm" loading={hide.isPending} onClick={() => hide.mutate()}>
            {t("setup.hide")}
          </Button>
        ) : null}
        <Link
          to="/r/$restaurantId/setup"
          params={{ restaurantId }}
          search={nextStep && !finished ? { step: nextStep } : {}}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-semibold text-white shadow-xs hover:bg-brand-700"
        >
          {finished ? t("setup.reopen") : t("setup.openGuide")} <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
