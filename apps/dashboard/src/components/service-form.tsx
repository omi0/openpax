import { WEEKDAYS } from "@openpax/core";
import type { ServiceDto, UpsertServiceInput } from "@openpax/shared";
import { Copy, Plus, Trash } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { DurationSelect, INTERVAL_OPTIONS, TURN_OPTIONS } from "@/components/duration-select";
import { Button, Field, IconButton, Input, Switch } from "@/components/ui";
import { cn } from "@/lib/utils";

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

/** One row per weekday: the day, its opening windows, and a way to add or remove one. */
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
  // "same hours every day": copy one day's windows to the other six
  const copyToAll = (windows: Window[]) =>
    onChange(Object.fromEntries(WEEKDAYS.map((d) => [d, windows.map((w) => ({ ...w }))])));
  return (
    <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
      {WEEKDAYS.map((day) => {
        const windows = value[day] ?? [];
        const open = windows.length > 0;
        return (
          <div
            key={day}
            className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !open && "bg-stone-50/60")}
          >
            <span className={cn("w-12 text-[15px] font-semibold", !open && "text-stone-400")}>
              {t(`weekday.${day}`)}
            </span>
            {!open ? (
              <span className="rounded-full bg-stone-200 px-2.5 py-0.5 text-[13px] font-medium text-stone-600">
                {t("services.closed")}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {windows.map((w, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <Input
                    type="time"
                    value={w.start}
                    className="h-10 w-[8.5rem] min-h-0 px-2.5 font-medium tabular-nums"
                    onChange={(e) =>
                      set(
                        day,
                        windows.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                      )
                    }
                  />
                  <span className="text-stone-400">–</span>
                  <Input
                    type="time"
                    value={w.end}
                    className="h-10 w-[8.5rem] min-h-0 px-2.5 font-medium tabular-nums"
                    onChange={(e) =>
                      set(
                        day,
                        windows.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)),
                      )
                    }
                  />
                  <IconButton
                    size="sm"
                    label={t("app.delete")}
                    className="text-stone-400 hover:text-red-600"
                    onClick={() =>
                      set(
                        day,
                        windows.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash />
                  </IconButton>
                </span>
              ))}
            </div>
            <span className="ml-auto flex items-center gap-1">
              {open ? (
                <IconButton
                  size="sm"
                  label={t("services.copyToAll")}
                  className="text-stone-400 hover:text-brand-700"
                  onClick={() => copyToAll(windows)}
                >
                  <Copy />
                </IconButton>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                className="text-brand-700"
                onClick={() =>
                  set(day, [...windows, { start: windows.at(-1)?.end ?? "19:00", end: "22:00" }])
                }
              >
                {t("services.addHours")}
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-stone-900 uppercase tracking-wide">{children}</h3>
      {hint ? <p className="mt-0.5 text-[13px] text-stone-500">{hint}</p> : null}
    </div>
  );
}

export function ServiceForm({
  initial,
  onSubmit,
  busy,
  submitLabel,
  id,
}: {
  initial: UpsertServiceInput;
  onSubmit: (v: UpsertServiceInput) => void;
  busy?: boolean;
  submitLabel: string;
  /** When set, the submit button is rendered by the host (e.g. a dialog footer) via `form={id}`. */
  id?: string;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState<UpsertServiceInput>(initial);
  const patch = (p: Partial<UpsertServiceInput>) => setV((x) => ({ ...x, ...p }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(v);
  };
  return (
    <form id={id} onSubmit={submit} className="space-y-6">
      <Field label={t("services.name")} required>
        <Input
          value={v.name}
          required
          maxLength={80}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Cena"
        />
      </Field>

      <div>
        <SectionTitle>{t("services.timing")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("services.slotInterval")} hint={t("services.slotIntervalHint")}>
            <DurationSelect
              value={v.slotIntervalMinutes}
              options={INTERVAL_OPTIONS}
              onChange={(slotIntervalMinutes) => patch({ slotIntervalMinutes })}
            />
          </Field>
          <Field label={t("services.duration")} hint={t("services.durationHint")}>
            <DurationSelect
              value={v.durationMinutes}
              options={TURN_OPTIONS}
              onChange={(durationMinutes) => patch({ durationMinutes })}
            />
          </Field>
        </div>
      </div>

      <div>
        <SectionTitle>{t("services.capacity")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("services.maxCovers")} hint={t("services.coversHint")}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={v.maxCoversPerSlot ?? ""}
              placeholder={t("services.unlimited")}
              onChange={(e) => patch({ maxCoversPerSlot: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label={t("services.maxBookings")}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={v.maxBookingsPerSlot ?? ""}
              placeholder={t("services.unlimited")}
              onChange={(e) => patch({ maxBookingsPerSlot: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label={t("services.minParty")} hint={t("services.partyHint")}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={v.minPartySize ?? ""}
              onChange={(e) => patch({ minPartySize: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label={t("services.maxParty")}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={v.maxPartySize ?? ""}
              onChange={(e) => patch({ maxPartySize: numOrNull(e.target.value) })}
            />
          </Field>
        </div>
      </div>

      <div>
        <SectionTitle hint={t("services.lastSeating")}>{t("services.hours")}</SectionTitle>
        <WeeklyHoursEditor
          value={v.weeklyHours}
          onChange={(weeklyHours) => patch({ weeklyHours })}
        />
      </div>

      <Switch
        checked={v.active}
        onChange={(active) => patch({ active })}
        label={t("services.active")}
        description={t("services.activeHint")}
      />

      {id ? null : (
        <div className="flex justify-end">
          <Button type="submit" size="lg" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
