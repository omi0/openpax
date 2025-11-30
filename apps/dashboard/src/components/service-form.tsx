import { WEEKDAYS } from "@sitli/core";
import type { ServiceDto, UpsertServiceInput } from "@sitli/shared";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Field, Input, Switch } from "@/components/ui";

type Hours = NonNullable<UpsertServiceInput["weeklyHours"]>;
type Window = { start: string; end: string };

export const defaultServiceInput = (): UpsertServiceInput => ({
  name: "",
  weeklyHours: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  slotIntervalMinutes: 30,
  durationMinutes: 120,
  maxCoversPerSlot: null,
  maxBookingsPerSlot: null,
  minPartySize: null,
  maxPartySize: null,
  active: true,
  sortOrder: 0,
});

export function serviceToInput(s: ServiceDto): UpsertServiceInput {
  return {
    name: s.name,
    weeklyHours: s.weeklyHours,
    slotIntervalMinutes: s.slotIntervalMinutes,
    durationMinutes: s.durationMinutes,
    maxCoversPerSlot: s.maxCoversPerSlot,
    maxBookingsPerSlot: s.maxBookingsPerSlot,
    minPartySize: s.minPartySize,
    maxPartySize: s.maxPartySize,
    active: s.active,
    sortOrder: s.sortOrder,
  };
}

const numOrNull = (v: string) => (v === "" ? null : Number(v));

export function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: Hours;
  onChange: (v: Hours) => void;
}) {
  const { t } = useTranslation();
  const set = (day: (typeof WEEKDAYS)[number], windows: Window[]) =>
    onChange({ ...value, [day]: windows });
  return (
    <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
      {WEEKDAYS.map((day) => {
        const windows = value[day] ?? [];
        return (
          <div key={day} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="w-10 text-sm font-medium">{t(`weekday.${day}`)}</span>
            {windows.length === 0 ? (
              <span className="text-sm text-zinc-400">{t("services.closed")}</span>
            ) : null}
            {windows.map((w, i) => (
              <span key={i} className="flex items-center gap-1">
                <Input
                  type="time"
                  value={w.start}
                  className="h-8 w-28"
                  onChange={(e) =>
                    set(
                      day,
                      windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                    )
                  }
                />
                <span className="text-zinc-400">–</span>
                <Input
                  type="time"
                  value={w.end}
                  className="h-8 w-28"
                  onChange={(e) =>
                    set(
                      day,
                      windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                  onClick={() =>
                    set(
                      day,
                      windows.filter((_, j) => j !== i),
                    )
                  }
                  aria-label={t("app.delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            ))}
            <button
              type="button"
              className="ml-auto flex items-center gap-1 text-xs text-brand hover:underline"
              onClick={() =>
                set(day, [...windows, { start: windows.at(-1)?.end ?? "19:00", end: "22:00" }])
              }
            >
              <Plus className="size-3" /> {t("services.addWindow")}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ServiceForm({
  initial,
  onSubmit,
  busy,
  submitLabel,
}: {
  initial: UpsertServiceInput;
  onSubmit: (v: UpsertServiceInput) => void;
  busy?: boolean;
  submitLabel: string;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState<UpsertServiceInput>(initial);
  const patch = (p: Partial<UpsertServiceInput>) => setV((x) => ({ ...x, ...p }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(v);
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("services.name")} className="sm:col-span-2">
          <Input
            value={v.name}
            required
            maxLength={80}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Cena"
          />
        </Field>
        <Field label={t("services.slotInterval")}>
          <Input
            type="number"
            min={5}
            max={240}
            step={5}
            value={v.slotIntervalMinutes}
            onChange={(e) => patch({ slotIntervalMinutes: Number(e.target.value) })}
          />
        </Field>
        <Field label={t("services.duration")}>
          <Input
            type="number"
            min={15}
            max={600}
            step={5}
            value={v.durationMinutes}
            onChange={(e) => patch({ durationMinutes: Number(e.target.value) })}
          />
        </Field>
        <Field label={t("services.maxCovers")} hint={t("services.coversHint")}>
          <Input
            type="number"
            min={1}
            value={v.maxCoversPerSlot ?? ""}
            placeholder={t("services.unlimited")}
            onChange={(e) => patch({ maxCoversPerSlot: numOrNull(e.target.value) })}
          />
        </Field>
        <Field label={t("services.maxBookings")}>
          <Input
            type="number"
            min={1}
            value={v.maxBookingsPerSlot ?? ""}
            placeholder={t("services.unlimited")}
            onChange={(e) => patch({ maxBookingsPerSlot: numOrNull(e.target.value) })}
          />
        </Field>
        <Field label={t("services.minParty")}>
          <Input
            type="number"
            min={1}
            value={v.minPartySize ?? ""}
            onChange={(e) => patch({ minPartySize: numOrNull(e.target.value) })}
          />
        </Field>
        <Field label={t("services.maxParty")}>
          <Input
            type="number"
            min={1}
            value={v.maxPartySize ?? ""}
            onChange={(e) => patch({ maxPartySize: numOrNull(e.target.value) })}
          />
        </Field>
      </div>
      <div>
        <span className="mb-1 block text-sm font-medium text-zinc-700">{t("services.hours")}</span>
        <p className="mb-2 text-xs text-zinc-500">{t("services.lastSeating")}</p>
        <WeeklyHoursEditor
          value={v.weeklyHours}
          onChange={(weeklyHours) => patch({ weeklyHours })}
        />
      </div>
      <div className="flex items-center gap-3">
        <Switch
          checked={v.active}
          onChange={(active) => patch({ active })}
          label={t("services.active")}
        />
        <span className="text-sm">{t("services.active")}</span>
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
