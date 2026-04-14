import type { AreaDto, TableDto, UpsertAreaInput } from "@openpax/shared";
import { DoorOpen, Pencil, Plus, Trash } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Card,
  Dialog,
  EmptyState,
  Field,
  Input,
  Switch,
  useConfirm,
} from "@/components/ui";
import { useCrud } from "@/lib/use-crud";
import { cn } from "@/lib/utils";

/** Rooms with their seats and an open/closed switch; the seats of open rooms cap the house. */
export function RoomsCard({
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
