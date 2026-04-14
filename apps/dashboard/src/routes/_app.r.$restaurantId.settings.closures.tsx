import type {
  CapacityRuleDto,
  ScheduleExceptionDto,
  UpsertCapacityRuleInput,
  UpsertScheduleExceptionInput,
} from "@openpax/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Pencil, Plus, SlidersHorizontal, Trash } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  CapacityRuleForm,
  defaultExceptionInput,
  defaultRuleInput,
  ExceptionForm,
  exceptionToInput,
  ruleToInput,
} from "@/components/schedule-forms";
import { Badge, Button, Card, Dialog, EmptyState, useConfirm } from "@/components/ui";
import {
  areasQuery,
  capacityRulesQuery,
  exceptionsQuery,
  restaurantQuery,
  servicesQuery,
} from "@/lib/queries";
import { useCrud } from "@/lib/use-crud";
import { cn, formatDate, formatDateRange, todayLocal } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/closures")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(servicesQuery(params.restaurantId)),
      context.queryClient.ensureQueryData(exceptionsQuery(params.restaurantId)),
      context.queryClient.ensureQueryData(capacityRulesQuery(params.restaurantId)),
      context.queryClient.ensureQueryData(areasQuery(params.restaurantId)),
    ]);
  },
  component: ClosuresPage,
});

function ClosuresPage() {
  const { restaurantId } = Route.useParams();
  return (
    <div className="space-y-5">
      <ExceptionsCard restaurantId={restaurantId} />
      <RulesCard restaurantId={restaurantId} />
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit?: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      {onEdit ? (
        <Button size="sm" variant="secondary" icon={<Pencil />} onClick={onEdit}>
          {t("app.edit")}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        icon={<Trash />}
        className="text-stone-500 hover:text-red-700"
        onClick={onDelete}
      >
        {t("app.delete")}
      </Button>
    </div>
  );
}

function ExceptionsCard({ restaurantId }: { restaurantId: string }) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const formId = useId();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: services } = useSuspenseQuery(servicesQuery(restaurantId));
  const { data: exceptions } = useSuspenseQuery(exceptionsQuery(restaurantId));
  const crud = useCrud<ScheduleExceptionDto, UpsertScheduleExceptionInput>(
    restaurantId,
    "schedule-exceptions",
    "schedule-exceptions",
  );
  const today = todayLocal(restaurant.timezone);
  const serviceName = (id: string | null) =>
    id ? (services.find((s) => s.id === id)?.name ?? "?") : t("closures.allServices");

  return (
    <Card
      title={t("closures.exceptions")}
      description={t("closures.exceptionsHint")}
      actions={
        <Button size="sm" icon={<Plus />} onClick={() => crud.setEditing("new")}>
          {t("closures.add")}
        </Button>
      }
      flush={exceptions.length > 0}
    >
      {exceptions.length === 0 ? (
        <EmptyState icon={<CalendarOff />} title={t("closures.empty")} />
      ) : (
        <ul className="divide-y divide-stone-100">
          {exceptions.map((e) => {
            const past = e.endDate < today;
            const range = e.endDate !== e.date;
            const days = range ? daysBetween(e.date, e.endDate) : 1;
            return (
              <li
                key={e.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3",
                  past && "bg-stone-50/60 opacity-60",
                )}
              >
                <span
                  className={cn(
                    "flex w-14 shrink-0 flex-col items-center justify-center rounded-xl border py-1.5 leading-none",
                    e.closed
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-amber-200 bg-amber-50 text-amber-900",
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase">
                    {formatDate(e.date, i18n.language, { month: "short" }).replace(".", "")}
                  </span>
                  <span className="mt-0.5 text-xl font-bold tabular-nums">
                    {formatDate(e.date, i18n.language, { day: "numeric" })}
                  </span>
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2 text-base font-semibold capitalize">
                    {range
                      ? formatDateRange(e.date, e.endDate, i18n.language)
                      : formatDate(e.date, i18n.language, {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                    {range ? (
                      <Badge size="sm" tone="neutral">
                        {t("closures.days", { count: days })}
                      </Badge>
                    ) : null}
                    {past ? (
                      <Badge size="sm" tone="neutral">
                        {t("closures.past")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                    <Badge tone={e.closed ? "danger" : "warning"} size="sm">
                      {e.closed
                        ? t("closures.closed")
                        : (e.windows ?? []).map((w) => `${w.start}–${w.end}`).join(", ")}
                    </Badge>
                    <span>{serviceName(e.serviceId)}</span>
                    {e.reason ? <span>· {e.reason}</span> : null}
                  </p>
                </div>
                <RowActions
                  onEdit={() => crud.setEditing(e)}
                  onDelete={async () => {
                    if (
                      await confirm({
                        title: t("closures.confirmDelete"),
                        confirmLabel: t("app.delete"),
                      })
                    )
                      crud.remove.mutate(e.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={crud.editing !== null}
        onClose={() => crud.setEditing(null)}
        title={crud.editing === "new" ? t("closures.add") : t("closures.edit")}
        footer={
          <>
            <Button variant="secondary" onClick={() => crud.setEditing(null)}>
              {t("app.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={crud.save.isPending}>
              {t("app.save")}
            </Button>
          </>
        }
      >
        {crud.editing ? (
          <ExceptionForm
            key={crud.editing === "new" ? "new" : crud.editing.id}
            id={formId}
            initial={
              crud.editing === "new" ? defaultExceptionInput(today) : exceptionToInput(crud.editing)
            }
            services={services}
            onSubmit={(v) => crud.save.mutate(v)}
            busy={crud.save.isPending}
            restaurantId={restaurantId}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

/** Days from `from` to `to`, both inclusive. */
function daysBetween(from: string, to: string): number {
  return (
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  );
}

function RulesCard({ restaurantId }: { restaurantId: string }) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const formId = useId();
  const { data: services } = useSuspenseQuery(servicesQuery(restaurantId));
  const { data: areas } = useSuspenseQuery(areasQuery(restaurantId));
  const { data: rules } = useSuspenseQuery(capacityRulesQuery(restaurantId));
  const crud = useCrud<CapacityRuleDto, UpsertCapacityRuleInput>(
    restaurantId,
    "capacity-rules",
    "capacity-rules",
  );

  const describe = (r: CapacityRuleDto) => {
    const parts: string[] = [];
    parts.push(
      r.serviceId
        ? (services.find((s) => s.id === r.serviceId)?.name ?? "?")
        : t("closures.anyService"),
    );
    if (r.areaId) parts.push(areas.find((a) => a.id === r.areaId)?.name ?? "?");
    if (r.date && r.endDate && r.endDate !== r.date)
      parts.push(formatDateRange(r.date, r.endDate, i18n.language));
    else if (r.date)
      parts.push(
        formatDate(r.date, i18n.language, { day: "numeric", month: "short", year: "numeric" }),
      );
    else if (r.weekday) parts.push(t(`weekday.${r.weekday}`));
    else parts.push(t("closures.everyDay"));
    parts.push(
      r.startTime || r.endTime ? `${r.startTime ?? "…"}–${r.endTime ?? "…"}` : t("closures.allDay"),
    );
    return parts.join(" · ");
  };
  const limits = (r: CapacityRuleDto) =>
    [
      r.maxCovers !== null ? `${t("closures.maxCovers")} ${r.maxCovers}` : null,
      r.maxBookings !== null ? `${t("closures.maxBookings")} ${r.maxBookings}` : null,
      r.maxPartySize !== null ? `${t("closures.maxParty")} ${r.maxPartySize}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || t("closures.noLimit");

  return (
    <Card
      title={t("closures.rules")}
      description={t("closures.rulesHint")}
      actions={
        <Button size="sm" icon={<Plus />} onClick={() => crud.setEditing("new")}>
          {t("closures.addRule")}
        </Button>
      }
      flush={rules.length > 0}
    >
      {rules.length === 0 ? (
        <EmptyState icon={<SlidersHorizontal />} title={t("closures.emptyRules")} />
      ) : (
        <ul className="divide-y divide-stone-100">
          {rules.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3",
                !r.active && "bg-stone-50/60 opacity-60",
              )}
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <SlidersHorizontal className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  {r.name || limits(r)}
                  {!r.active ? <Badge size="sm">{t("closures.inactive")}</Badge> : null}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {describe(r)}
                  {r.name ? ` · ${limits(r)}` : ""}
                </p>
              </div>
              <RowActions
                onEdit={() => crud.setEditing(r)}
                onDelete={async () => {
                  if (
                    await confirm({
                      title: t("closures.confirmDeleteRule"),
                      confirmLabel: t("app.delete"),
                    })
                  )
                    crud.remove.mutate(r.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={crud.editing !== null}
        onClose={() => crud.setEditing(null)}
        title={crud.editing === "new" ? t("closures.addRule") : t("closures.editRule")}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => crud.setEditing(null)}>
              {t("app.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={crud.save.isPending}>
              {t("app.save")}
            </Button>
          </>
        }
      >
        {crud.editing ? (
          <CapacityRuleForm
            key={crud.editing === "new" ? "new" : crud.editing.id}
            id={formId}
            initial={crud.editing === "new" ? defaultRuleInput() : ruleToInput(crud.editing)}
            services={services}
            areas={areas}
            onSubmit={(v) => crud.save.mutate(v)}
            busy={crud.save.isPending}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}
