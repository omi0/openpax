import type { TableDto, UpsertTableInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FloorPlan, PLAN_H, PLAN_W, type Position } from "@/components/floor-plan";
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Switch,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { areasQuery, tablesQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/tables")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(tablesQuery(params.restaurantId)),
      context.queryClient.ensureQueryData(areasQuery(params.restaurantId)),
    ]);
  },
  component: TablesPage,
});

const blank = (count: number): UpsertTableInput => ({
  name: `T${count + 1}`,
  areaId: null,
  minCovers: 1,
  maxCovers: 2,
  shape: "rect",
  x: (count * 12) % (PLAN_W - 10),
  y: Math.min(PLAN_H - 10, Math.floor((count * 12) / (PLAN_W - 10)) * 12),
  width: 10,
  height: 10,
  joinable: true,
  active: true,
  sortOrder: count,
});

const toInput = (t: TableDto): UpsertTableInput => ({
  name: t.name,
  areaId: t.areaId,
  minCovers: t.minCovers,
  maxCovers: t.maxCovers,
  shape: t.shape,
  x: t.x,
  y: t.y,
  width: t.width,
  height: t.height,
  joinable: t.joinable,
  active: t.active,
  sortOrder: t.sortOrder,
});

function TablesPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: tables } = useSuspenseQuery(tablesQuery(restaurantId));
  const { data: areas } = useSuspenseQuery(areasQuery(restaurantId));
  const [editing, setEditing] = useState<TableDto | "new" | null>(null);
  const [pending, setPending] = useState<Map<string, Position>>(new Map());
  const [layoutSaved, setLayoutSaved] = useState(false);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "tables"] });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/tables/${id}`),
    onSuccess: invalidate,
  });
  const saveLayout = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/restaurants/${restaurantId}/tables/positions`, {
        positions: [...pending.values()],
      }),
    onSuccess: async () => {
      setPending(new Map());
      setLayoutSaved(true);
      await invalidate();
    },
  });

  // show dragged-but-unsaved positions
  const shown = tables.map((x) => {
    const p = pending.get(x.id);
    return p ? { ...x, x: p.x, y: p.y } : x;
  });
  const areaName = (id: string | null) =>
    areas.find((a) => a.id === id)?.name ?? t("tables.noArea");

  return (
    <div className="space-y-4">
      <Card
        title={t("tables.floorPlan")}
        description={t("tables.floorPlanHint")}
        actions={
          <div className="flex items-center gap-2">
            {layoutSaved && pending.size === 0 ? (
              <span className="text-sm text-emerald-700">{t("app.saved")}</span>
            ) : null}
            <Button
              size="sm"
              disabled={pending.size === 0}
              loading={saveLayout.isPending}
              onClick={() => saveLayout.mutate()}
            >
              {t("tables.saveLayout")}
            </Button>
          </div>
        }
      >
        {tables.length === 0 ? (
          <EmptyState>{t("tables.empty")}</EmptyState>
        ) : (
          <FloorPlan
            tables={shown}
            areas={areas}
            onMove={(positions) => {
              const next = new Map(pending);
              for (const p of positions) next.set(p.id, p);
              setPending(next);
              setLayoutSaved(false);
            }}
            onSelect={(table) => setEditing(table)}
          />
        )}
      </Card>

      <Card
        title={t("tables.title")}
        description={t("tables.hint")}
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            {t("tables.add")}
          </Button>
        }
      >
        {tables.length === 0 ? (
          <EmptyState>{t("tables.empty")}</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {tables.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-16 font-medium">{x.name}</span>
                <span className="text-zinc-500">{areaName(x.areaId)}</span>
                <span className="text-zinc-500">
                  {t("tables.seats", { min: x.minCovers, max: x.maxCovers })}
                </span>
                <span className="text-zinc-400">{t(`tables.shapes.${x.shape}`)}</span>
                {x.joinable ? <Badge tone="neutral">{t("tables.joinable")}</Badge> : null}
                {!x.active ? <Badge tone="cancelled">{t("tables.inactive")}</Badge> : null}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(x)}>
                    {t("app.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm(t("app.confirmDelete"))) remove.mutate(x.id);
                    }}
                  >
                    {t("app.delete")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing ? (
        <TableDialog
          key={editing === "new" ? "new" : editing.id}
          restaurantId={restaurantId}
          table={editing === "new" ? null : editing}
          initial={editing === "new" ? blank(tables.length) : toInput(editing)}
          areas={areas}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await invalidate();
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function TableDialog({
  restaurantId,
  table,
  initial,
  areas,
  onClose,
  onSaved,
}: {
  restaurantId: string;
  table: TableDto | null;
  initial: UpsertTableInput;
  areas: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState<UpsertTableInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: UpsertTableInput) =>
      table
        ? api.put(`/api/v1/restaurants/${restaurantId}/tables/${table.id}`, body)
        : api.post(`/api/v1/restaurants/${restaurantId}/tables`, body),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate(v);
  };
  const num =
    (key: "minCovers" | "maxCovers" | "sortOrder" | "width" | "height") =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setV({ ...v, [key]: Number(e.target.value) });

  return (
    <Dialog open onClose={onClose} title={table ? t("tables.edit") : t("tables.add")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label={t("tables.name")}>
          <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required />
        </Field>
        <Field label={t("tables.area")}>
          <Select
            value={v.areaId ?? ""}
            onChange={(e) => setV({ ...v, areaId: e.target.value || null })}
          >
            <option value="">{t("tables.noArea")}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("tables.minCovers")}>
          <Input type="number" min={1} max={100} value={v.minCovers} onChange={num("minCovers")} />
        </Field>
        <Field label={t("tables.maxCovers")}>
          <Input type="number" min={1} max={100} value={v.maxCovers} onChange={num("maxCovers")} />
        </Field>
        <Field label={t("tables.shape")}>
          <Select
            value={v.shape}
            onChange={(e) => setV({ ...v, shape: e.target.value as UpsertTableInput["shape"] })}
          >
            <option value="rect">{t("tables.shapes.rect")}</option>
            <option value="round">{t("tables.shapes.round")}</option>
          </Select>
        </Field>
        <Field label={t("tables.sortOrder")} hint={t("tables.sortOrderHint")}>
          <Input type="number" value={v.sortOrder} onChange={num("sortOrder")} />
        </Field>
        <Field label={t("tables.width")}>
          <Input type="number" min={2} max={100} value={v.width} onChange={num("width")} />
        </Field>
        <Field label={t("tables.height")}>
          <Input type="number" min={2} max={70} value={v.height} onChange={num("height")} />
        </Field>
        <div className="flex items-center gap-3">
          <Switch
            checked={v.joinable}
            onChange={(joinable) => setV({ ...v, joinable })}
            label={t("tables.joinable")}
          />
          <span className="text-sm">{t("tables.joinable")}</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={v.active}
            onChange={(active) => setV({ ...v, active })}
            label={t("tables.active")}
          />
          <span className="text-sm">{t("tables.active")}</span>
        </div>
        <p className="text-xs text-zinc-500 sm:col-span-2">{t("tables.joinableHint")}</p>
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {t("app.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
