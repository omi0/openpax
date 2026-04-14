import { WEEKDAYS } from "@openpax/core";
import type { ServiceDto, UpsertServiceInput } from "@openpax/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Pencil, Plus, Trash } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { defaultServiceInput, ServiceForm, serviceToInput } from "@/components/service-form";
import { Badge, Button, Card, Dialog, EmptyState, useConfirm, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { servicesQuery } from "@/lib/queries";
import { cn, formatDuration } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/services")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(servicesQuery(params.restaurantId)),
  component: ServicesPage,
});

function ServicesPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const duration = (m: number) =>
    formatDuration(m, i18n.language, (count) => t("duration.days", { count }));
  const toast = useToast();
  const formId = useId();
  const { data: services } = useSuspenseQuery(servicesQuery(restaurantId));
  const [editing, setEditing] = useState<ServiceDto | "new" | null>(null);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "services"] });

  const save = useMutation({
    mutationFn: (v: UpsertServiceInput) =>
      editing === "new" || !editing
        ? api.post(`/api/v1/restaurants/${restaurantId}/services`, v)
        : api.put(`/api/v1/restaurants/${restaurantId}/services/${editing.id}`, v),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      toast.success(t("app.saved"));
    },
    onError: () => toast.error(t("app.error")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/services/${id}`),
    onSuccess: invalidate,
    onError: () => toast.error(t("app.error")),
  });

  return (
    <Card
      title={t("services.list")}
      description={t("services.description")}
      actions={
        <Button size="sm" icon={<Plus />} onClick={() => setEditing("new")}>
          {t("services.add")}
        </Button>
      }
      flush={services.length > 0}
    >
      {services.length === 0 ? (
        <EmptyState icon={<Clock />} title={t("services.empty")} />
      ) : (
        <ul className="divide-y divide-stone-100">
          {services.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4",
                !s.active && "bg-stone-50/60",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl",
                  s.active ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-400",
                )}
              >
                <Clock className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
                  {s.name}
                  {!s.active ? <Badge size="sm">{t("tables.inactive")}</Badge> : null}
                </p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {t("services.every", { value: duration(s.slotIntervalMinutes) })} ·{" "}
                  {t("services.turn", { value: duration(s.durationMinutes) })} ·{" "}
                  {s.maxCoversPerSlot !== null
                    ? t("services.maxCoversShort", { count: s.maxCoversPerSlot })
                    : t("services.unlimited")}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1" aria-label={t("services.hours")}>
                  {WEEKDAYS.map((day) => {
                    const windows = s.weeklyHours[day] ?? [];
                    const open = windows.length > 0;
                    return (
                      <li
                        key={day}
                        title={
                          open
                            ? windows.map((w) => `${w.start}–${w.end}`).join(", ")
                            : t("services.closed")
                        }
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-xs font-semibold",
                          open ? "bg-brand-100 text-brand-800" : "bg-stone-100 text-stone-400",
                        )}
                      >
                        {t(`weekday.${day}`)}
                        {open ? (
                          <span className="ml-1 font-normal tabular-nums">
                            {windows[0]?.start}–{windows.at(-1)?.end}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pencil />}
                  onClick={() => setEditing(s)}
                >
                  {t("app.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash />}
                  className="text-stone-500 hover:text-red-700"
                  disabled={remove.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("app.confirmDelete"),
                        description: t("services.confirmDelete"),
                        confirmLabel: t("app.delete"),
                      })
                    )
                      remove.mutate(s.id);
                  }}
                >
                  {t("app.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("services.add") : t("services.edit")}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t("app.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={save.isPending}>
              {t("app.save")}
            </Button>
          </>
        }
      >
        {editing ? (
          <ServiceForm
            key={editing === "new" ? "new" : editing.id}
            id={formId}
            initial={editing === "new" ? defaultServiceInput() : serviceToInput(editing)}
            onSubmit={(v) => save.mutate(v)}
            busy={save.isPending}
            submitLabel={t("app.save")}
          />
        ) : null}
      </Dialog>
    </Card>
  );
}
