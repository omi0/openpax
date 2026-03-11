import type { AreaDto, TableDto, UpsertAreaInput, UpsertTableInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { DoorOpen, LayoutGrid, Pencil, Plus, Save, Trash } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
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
  useConfirm,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { areasQuery, tablesQuery } from "@/lib/queries";
import { useCrud } from "@/lib/use-crud";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/tables")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(tablesQuery(params.restaurantId)),
      context.queryClient.ensureQueryData(areasQuery(params.restaurantId)),
    ]);
  },
  component: TablesPage,
});

const blank = (count: number, roomId: string | null): UpsertTableInput => ({
  name: `T${count + 1}`,
  areaId: roomId,
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
  const confirm = useConfirm();
  const toast = useToast();
  const { data: tables } = useSuspenseQuery(tablesQuery(restaurantId));
  const { data: areas } = useSuspenseQuery(areasQuery(restaurantId));
  const [editing, setEditing] = useState<TableDto | "new" | null>(null);
  const [pending, setPending] = useState<Map<string, Position>>(new Map());
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "tables"] });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/tables/${id}`),
    onSuccess: invalidate,
    onError: () => toast.error(t("app.error")),
  });
  const saveLayout = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/restaurants/${restaurantId}/tables/positions`, {
        positions: [...pending.values()],
      }),
    onSuccess: async () => {
      setPending(new Map());
      toast.success(t("tables.layoutSaved"));
      await invalidate();
    },
    onError: () => toast.error(t("app.error")),
  });

  // show dragged-but-unsaved positions
  const shown = tables.map((x) => {
    const p = pending.get(x.id);
    return p ? { ...x, x: p.x, y: p.y } : x;
  });
  const areaName = (id: string | null) =>
    areas.find((a) => a.id === id)?.name ?? t("tables.noArea");

  return (
    <div className="space-y-5">
      <RoomsCard restaurantId={restaurantId} rooms={areas} tables={tables} />

      <Card
        title={t("tables.floorPlan")}
        description={t("tables.floorPlanHint")}
        actions={
          <Button
            size="sm"
            icon={<Save />}
            disabled={pending.size === 0}
            loading={saveLayout.isPending}
            onClick={() => saveLayout.mutate()}
          >
            {t("tables.saveLayout")}
          </Button>
        }
      >
        {tables.length === 0 ? (
          <EmptyState icon={<LayoutGrid />} title={t("tables.emptyPlan")} />
        ) : (
          <FloorPlan
            tables={shown}
            areas={areas}
            onMove={(positions) => {
              const next = new Map(pending);
              for (const p of positions) next.set(p.id, p);
              setPending(next);
            }}
            onSelect={(table) => setEditing(table)}
          />
        )}
      </Card>

      <Card
        title={t("tables.list")}
        description={t("tables.hint")}
        actions={
          <Button size="sm" icon={<Plus />} onClick={() => setEditing("new")}>
            {t("tables.add")}
          </Button>
        }
        flush={tables.length > 0}
      >
        {tables.length === 0 ? (
          <EmptyState icon={<LayoutGrid />} title={t("tables.empty")} />
        ) : (
          <ul className="divide-y divide-stone-100">
            {tables.map((x) => (
              <li
                key={x.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3",
                  !x.active && "bg-stone-50/60 opacity-60",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-11 min-w-11 shrink-0 items-center justify-center border-2 px-2 text-base font-bold",
                    x.shape === "round" ? "rounded-full" : "rounded-xl",
                    x.active
                      ? "border-stone-300 bg-white text-stone-800"
                      : "border-stone-200 bg-stone-100 text-stone-400",
                  )}
                >
                  {x.name}
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-[15px] font-semibold">
                    {t("tables.seats", { min: x.minCovers, max: x.maxCovers })}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                    <span>{areaName(x.areaId)}</span>
                    <Badge size="sm">{t(`tables.shapes.${x.shape}`)}</Badge>
                    {x.joinable ? (
                      <Badge size="sm" tone="brand">
                        {t("tables.joinable")}
                      </Badge>
                    ) : null}
                    {!x.active ? (
                      <Badge size="sm" tone="danger">
                        {t("tables.inactive")}
                      </Badge>
                    ) : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Pencil />}
                    onClick={() => setEditing(x)}
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
                          title: t("tables.confirmDelete"),
                          confirmLabel: t("app.delete"),
                        })
                      )
                        remove.mutate(x.id);
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
          initial={
            editing === "new"
              ? blank(tables.length, areas.find((a) => a.active)?.id ?? null)
              : toInput(editing)
          }
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
  const formId = useId();
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
    <Dialog
      open
      onClose={onClose}
      title={table ? t("tables.edit") : t("tables.add")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {t("app.save")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("tables.name")} required>
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
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={v.minCovers}
            onChange={num("minCovers")}
          />
        </Field>
        <Field label={t("tables.maxCovers")}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={v.maxCovers}
            onChange={num("maxCovers")}
          />
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
          <Input
            type="number"
            inputMode="numeric"
            value={v.sortOrder}
            onChange={num("sortOrder")}
          />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-stone-700">{t("tables.size")}</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("tables.width")}>
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={100}
                value={v.width}
                onChange={num("width")}
              />
            </Field>
            <Field label={t("tables.height")}>
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={70}
                value={v.height}
                onChange={num("height")}
              />
            </Field>
          </div>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <Switch
            checked={v.joinable}
            onChange={(joinable) => setV({ ...v, joinable })}
            label={t("tables.joinable")}
            description={t("tables.joinableHint")}
          />
          <Switch
            checked={v.active}
            onChange={(active) => setV({ ...v, active })}
            label={t("tables.active")}
            description={t("tables.activeHint")}
          />
        </div>
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

/** Rooms with their seats and an open/closed switch; the seats of open rooms cap the house. */
function RoomsCard({
  restaurantId,
  rooms,
  tables,
}: {
  restaurantId: string;
  rooms: AreaDto[];
  tables: TableDto[];
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const crud = useCrud<AreaDto, UpsertAreaInput>(restaurantId, "areas", ["areas", "tables"]);
  const toInput = (r: AreaDto): UpsertAreaInput => ({
    name: r.name,
    sortOrder: r.sortOrder,
    active: r.active,
    seats: r.seats,
  });
  const missingSeats = rooms.some((r) => r.active && r.seats === null);
  const tablesIn = (id: string) => tables.filter((x) => x.areaId === id).length;

  return (
    <Card
      title={t("rooms.title")}
      description={t("rooms.hint")}
      actions={
        <Button size="sm" icon={<Plus />} onClick={() => crud.setEditing("new")}>
          {t("rooms.add")}
        </Button>
      }
      flush={rooms.length > 0}
    >
      {missingSeats ? (
        <div className={rooms.length > 0 ? "px-5 pt-4" : "mb-4"}>
          <Alert tone="warning">{t("rooms.noSeatsWarning")}</Alert>
        </div>
      ) : null}
      {rooms.length === 0 ? (
        <EmptyState icon={<DoorOpen />} title={t("rooms.empty")}>
          {t("rooms.emptyHint")}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {rooms.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-3",
                !r.active && "bg-stone-50/60",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl",
                  r.active ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-400",
                )}
              >
                <DoorOpen className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className={cn("text-[15px] font-semibold", !r.active && "text-stone-500")}>
                  {r.name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-stone-500">
                  {r.seats === null ? (
                    <span className="font-medium text-amber-700">{t("rooms.seatsUnset")}</span>
                  ) : (
                    <span>{t("rooms.seatsCount", { count: r.seats })}</span>
                  )}
                  <span>{t("rooms.tablesCount", { count: tablesIn(r.id) })}</span>
                </p>
              </div>
              <Switch
                checked={r.active}
                label={r.active ? t("rooms.open") : t("rooms.closed")}
                disabled={crud.patch.isPending}
                onChange={(active) =>
                  crud.patch.mutate({ id: r.id, body: { ...toInput(r), active } })
                }
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pencil />}
                  onClick={() => crud.setEditing(r)}
                >
                  {t("app.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash />}
                  className="text-stone-500 hover:text-red-700"
                  disabled={crud.remove.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("rooms.confirmDelete"),
                        confirmLabel: t("app.delete"),
                      })
                    )
                      crud.remove.mutate(r.id);
                  }}
                >
                  {t("app.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {crud.editing ? (
        <RoomDialog
          key={crud.editing === "new" ? "new" : crud.editing.id}
          initial={
            crud.editing === "new"
              ? { name: "", sortOrder: rooms.length, active: true, seats: null }
              : toInput(crud.editing)
          }
          isNew={crud.editing === "new"}
          busy={crud.save.isPending}
          onClose={() => crud.setEditing(null)}
          onSubmit={(v) => crud.save.mutate(v)}
        />
      ) : null}
    </Card>
  );
}

function RoomDialog({
  initial,
  isNew,
  busy,
  onClose,
  onSubmit,
}: {
  initial: UpsertAreaInput;
  isNew: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: UpsertAreaInput) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [v, setV] = useState<UpsertAreaInput>(initial);
  return (
    <Dialog
      open
      onClose={onClose}
      title={isNew ? t("rooms.add") : t("rooms.edit")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={busy}>
            {t("app.save")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(v);
        }}
        className="space-y-4"
      >
        <Field label={t("rooms.name")} required>
          <Input
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            required
            maxLength={80}
          />
        </Field>
        <Field label={t("rooms.seats")} hint={t("rooms.seatsHint")} required>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={5000}
            required
            value={v.seats ?? ""}
            onChange={(e) =>
              setV({ ...v, seats: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Switch
          checked={v.active}
          onChange={(active) => setV({ ...v, active })}
          label={t("rooms.open")}
        />
      </form>
    </Dialog>
  );
}
