import type {
  AreaDto,
  CapacityRuleDto,
  ScheduleExceptionDto,
  UpsertCapacityRuleInput,
  UpsertScheduleExceptionInput,
} from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CapacityRuleForm,
  defaultExceptionInput,
  defaultRuleInput,
  ExceptionForm,
  exceptionToInput,
  ruleToInput,
} from "@/components/schedule-forms";
import { Badge, Button, Card, Dialog, EmptyState, Input } from "@/components/ui";
import { api } from "@/lib/api";
import {
  areasQuery,
  capacityRulesQuery,
  exceptionsQuery,
  restaurantQuery,
  servicesQuery,
} from "@/lib/queries";
import { cn, formatDate, todayLocal } from "@/lib/utils";

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
    <div className="space-y-4">
      <ExceptionsCard restaurantId={restaurantId} />
      <RulesCard restaurantId={restaurantId} />
      <AreasCard restaurantId={restaurantId} />
    </div>
  );
}

/** Generic list + dialog CRUD wiring shared by the three cards. */
function useCrud<TDto extends { id: string }, TInput>(
  restaurantId: string,
  segment: string,
  key: string,
) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TDto | "new" | null>(null);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, key] }),
      queryClient.invalidateQueries({ queryKey: ["availability"] }),
    ]);
  const save = useMutation({
    mutationFn: (v: TInput) =>
      editing === "new" || !editing
        ? api.post(`/api/v1/restaurants/${restaurantId}/${segment}`, v)
        : api.put(`/api/v1/restaurants/${restaurantId}/${segment}/${editing.id}`, v),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/${segment}/${id}`),
    onSuccess: invalidate,
  });
  return { editing, setEditing, save, remove };
}

function ExceptionsCard({ restaurantId }: { restaurantId: string }) {
  const { t, i18n } = useTranslation();
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
        <Button size="sm" onClick={() => crud.setEditing("new")}>
          {t("closures.add")}
        </Button>
      }
    >
      {exceptions.length === 0 ? (
        <EmptyState>{t("closures.empty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {exceptions.map((e) => (
            <li
              key={e.id}
              className={cn(
                "flex flex-wrap items-center gap-3 py-3",
                e.date < today && "opacity-50",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium capitalize">
                  {formatDate(e.date, i18n.language, {
                    weekday: "short",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {e.date < today ? (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      {t("closures.past")}
                    </span>
                  ) : null}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{serviceName(e.serviceId)}</span>
                  <Badge tone={e.closed ? "cancelled" : "pending"}>
                    {e.closed
                      ? t("closures.closed")
                      : (e.windows ?? []).map((w) => `${w.start}–${w.end}`).join(", ")}
                  </Badge>
                  {e.reason ? <span>{e.reason}</span> : null}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => crud.setEditing(e)}>
                {t("app.edit")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm(t("app.confirmDelete"))) crud.remove.mutate(e.id);
                }}
              >
                {t("app.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={crud.editing !== null}
        onClose={() => crud.setEditing(null)}
        title={crud.editing === "new" ? t("closures.add") : t("closures.edit")}
      >
        {crud.editing ? (
          <ExceptionForm
            key={crud.editing === "new" ? "new" : crud.editing.id}
            initial={
              crud.editing === "new" ? defaultExceptionInput(today) : exceptionToInput(crud.editing)
            }
            services={services}
            onSubmit={(v) => crud.save.mutate(v)}
            busy={crud.save.isPending}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}

function RulesCard({ restaurantId }: { restaurantId: string }) {
  const { t, i18n } = useTranslation();
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
    if (r.date)
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
        <Button size="sm" onClick={() => crud.setEditing("new")}>
          {t("closures.addRule")}
        </Button>
      }
    >
      {rules.length === 0 ? (
        <EmptyState>{t("closures.emptyRules")}</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {rules.map((r) => (
            <li
              key={r.id}
              className={cn("flex flex-wrap items-center gap-3 py-3", !r.active && "opacity-50")}
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.name || limits(r)} {!r.active ? <Badge>{t("closures.inactive")}</Badge> : null}
                </p>
                <p className="text-xs text-zinc-500">
                  {describe(r)}
                  {r.name ? ` · ${limits(r)}` : ""}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => crud.setEditing(r)}>
                {t("app.edit")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm(t("app.confirmDelete"))) crud.remove.mutate(r.id);
                }}
              >
                {t("app.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={crud.editing !== null}
        onClose={() => crud.setEditing(null)}
        title={crud.editing === "new" ? t("closures.addRule") : t("closures.editRule")}
      >
        {crud.editing ? (
          <CapacityRuleForm
            key={crud.editing === "new" ? "new" : crud.editing.id}
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

function AreasCard({ restaurantId }: { restaurantId: string }) {
  const { t } = useTranslation();
  const { data: areas } = useSuspenseQuery(areasQuery(restaurantId));
  const crud = useCrud<AreaDto, { name: string; sortOrder: number; active: boolean }>(
    restaurantId,
    "areas",
    "areas",
  );
  const [name, setName] = useState("");
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    crud.setEditing("new");
    crud.save.mutate(
      { name: name.trim(), sortOrder: areas.length, active: true },
      { onSuccess: () => setName("") },
    );
  };
  return (
    <Card title={t("closures.areas")} description={t("closures.areasHint")}>
      {areas.length === 0 ? (
        <EmptyState>{t("closures.emptyAreas")}</EmptyState>
      ) : (
        <ul className="mb-3 divide-y divide-zinc-100">
          {areas.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2">
              <span className="flex-1 text-sm font-medium">{a.name}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm(t("app.confirmDelete"))) crud.remove.mutate(a.id);
                }}
              >
                {t("app.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("closures.areaName")}
          maxLength={80}
          aria-label={t("closures.areaName")}
        />
        <Button type="submit" variant="secondary" loading={crud.save.isPending}>
          {t("closures.addArea")}
        </Button>
      </form>
    </Card>
  );
}
