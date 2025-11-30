import type { ServiceDto, UpsertServiceInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { defaultServiceInput, ServiceForm, serviceToInput } from "@/components/service-form";
import { Badge, Button, Card, Dialog, EmptyState } from "@/components/ui";
import { api } from "@/lib/api";
import { servicesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/services")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(servicesQuery(params.restaurantId)),
  component: ServicesPage,
});

function ServicesPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
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
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/services/${id}`),
    onSuccess: invalidate,
  });

  return (
    <Card
      title={t("services.title")}
      description={t("services.description")}
      actions={
        <Button size="sm" onClick={() => setEditing("new")}>
          {t("services.add")}
        </Button>
      }
    >
      {services.length === 0 ? (
        <EmptyState>{t("services.empty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {services.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {s.name} {!s.active ? <Badge>off</Badge> : null}
                </p>
                <p className="text-xs text-zinc-500">
                  {s.slotIntervalMinutes} min · {s.durationMinutes} min ·{" "}
                  {s.maxCoversPerSlot ?? t("services.unlimited")}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                {t("app.edit")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (window.confirm(t("app.confirmDelete"))) remove.mutate(s.id);
                }}
              >
                {t("app.delete")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? t("services.add") : t("services.edit")}
      >
        {editing ? (
          <ServiceForm
            key={editing === "new" ? "new" : editing.id}
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
