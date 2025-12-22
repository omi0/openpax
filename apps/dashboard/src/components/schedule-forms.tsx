import { WEEKDAYS } from "@sitli/core";
import type {
  AreaDto,
  CapacityRuleDto,
  ScheduleExceptionDto,
  ServiceDto,
  UpsertCapacityRuleInput,
  UpsertScheduleExceptionInput,
} from "@sitli/shared";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Field, Input, Select, Switch, Textarea } from "@/components/ui";

type Window = { start: string; end: string };
const numOrNull = (v: string) => (v === "" ? null : Number(v));

export function WindowsEditor({
  value,
  onChange,
}: {
  value: Window[];
  onChange: (v: Window[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {value.map((w, i) => (
        <div key={`${i}-${w.start}`} className="flex items-center gap-1">
          <Input
            type="time"
            value={w.start}
            className="h-8 w-28"
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
            }
            required
          />
          <span className="text-zinc-400">–</span>
          <Input
            type="time"
            value={w.end}
            className="h-8 w-28"
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
            }
            required
          />
          <button
            type="button"
            aria-label={t("app.delete")}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      {value.length < 6 ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...value, { start: "12:00", end: "15:00" }])}
        >
          <Plus className="size-4" /> {t("closures.addWindow")}
        </Button>
      ) : null}
    </div>
  );
}

// ---------- schedule exceptions

export const defaultExceptionInput = (date: string): UpsertScheduleExceptionInput => ({
  serviceId: null,
  date,
  closed: true,
  windows: null,
  reason: null,
});

export const exceptionToInput = (e: ScheduleExceptionDto): UpsertScheduleExceptionInput => ({
  serviceId: e.serviceId,
  date: e.date,
  closed: e.closed,
  windows: e.windows,
  reason: e.reason,
});

export function ExceptionForm({
  initial,
  services,
  onSubmit,
  busy,
}: {
  initial: UpsertScheduleExceptionInput;
  services: ServiceDto[];
  onSubmit: (v: UpsertScheduleExceptionInput) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...v,
      windows: v.closed ? null : (v.windows ?? []),
      reason: v.reason?.trim() || null,
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label={t("closures.date")}>
        <Input
          type="date"
          value={v.date}
          onChange={(e) => setV({ ...v, date: e.target.value })}
          required
        />
      </Field>
      <Field label={t("closures.scope")}>
        <Select
          value={v.serviceId ?? ""}
          onChange={(e) => setV({ ...v, serviceId: e.target.value || null })}
        >
          <option value="">{t("closures.allServices")}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Switch
          checked={v.closed}
          onChange={(closed) =>
            setV({
              ...v,
              closed,
              windows: closed ? null : (v.windows ?? [{ start: "19:00", end: "22:00" }]),
            })
          }
          label={t("closures.closed")}
        />
        <span className="text-sm">
          {v.closed ? t("closures.closed") : t("closures.specialHours")}
        </span>
      </div>
      {!v.closed ? (
        <Field label={t("closures.windows")} className="sm:col-span-2">
          <WindowsEditor value={v.windows ?? []} onChange={(windows) => setV({ ...v, windows })} />
        </Field>
      ) : null}
      <Field label={t("closures.reason")} hint={t("closures.reasonHint")} className="sm:col-span-2">
        <Textarea
          value={v.reason ?? ""}
          maxLength={200}
          className="min-h-12"
          onChange={(e) => setV({ ...v, reason: e.target.value })}
        />
      </Field>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={busy}>
          {t("app.save")}
        </Button>
      </div>
    </form>
  );
}

// ---------- capacity rules

export const defaultRuleInput = (): UpsertCapacityRuleInput => ({
  name: null,
  serviceId: null,
  areaId: null,
  weekday: null,
  date: null,
  startTime: null,
  endTime: null,
  maxCovers: null,
  maxBookings: null,
  maxPartySize: null,
  active: true,
});

export const ruleToInput = (r: CapacityRuleDto): UpsertCapacityRuleInput => ({
  name: r.name,
  serviceId: r.serviceId,
  areaId: r.areaId,
  weekday: r.weekday,
  date: r.date,
  startTime: r.startTime,
  endTime: r.endTime,
  maxCovers: r.maxCovers,
  maxBookings: r.maxBookings,
  maxPartySize: r.maxPartySize,
  active: r.active,
});

type WhenMode = "always" | "weekday" | "date";

export function CapacityRuleForm({
  initial,
  services,
  areas,
  onSubmit,
  busy,
}: {
  initial: UpsertCapacityRuleInput;
  services: ServiceDto[];
  areas: AreaDto[];
  onSubmit: (v: UpsertCapacityRuleInput) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState(initial);
  const [mode, setMode] = useState<WhenMode>(
    initial.date ? "date" : initial.weekday ? "weekday" : "always",
  );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...v,
      name: v.name?.trim() || null,
      weekday: mode === "weekday" ? v.weekday : null,
      date: mode === "date" ? v.date : null,
      startTime: v.startTime || null,
      endTime: v.endTime || null,
    });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label={t("closures.name")} className="sm:col-span-2">
        <Input
          value={v.name ?? ""}
          maxLength={80}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </Field>
      <Field label={t("closures.service")}>
        <Select
          value={v.serviceId ?? ""}
          onChange={(e) => setV({ ...v, serviceId: e.target.value || null })}
        >
          <option value="">{t("closures.anyService")}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("closures.area")}>
        <Select
          value={v.areaId ?? ""}
          onChange={(e) => setV({ ...v, areaId: e.target.value || null })}
          disabled={areas.length === 0}
        >
          <option value="">{t("closures.anyArea")}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("closures.when")}>
        <Select value={mode} onChange={(e) => setMode(e.target.value as WhenMode)}>
          <option value="always">{t("closures.everyDay")}</option>
          <option value="weekday">{t("closures.weekday")}</option>
          <option value="date">{t("closures.onDate")}</option>
        </Select>
      </Field>
      {mode === "weekday" ? (
        <Field label={t("closures.weekday")}>
          <Select
            value={v.weekday ?? ""}
            onChange={(e) =>
              setV({
                ...v,
                weekday: (e.target.value || null) as UpsertCapacityRuleInput["weekday"],
              })
            }
            required
          >
            <option value="">—</option>
            {WEEKDAYS.map((d) => (
              <option key={d} value={d}>
                {t(`weekday.${d}`)}
              </option>
            ))}
          </Select>
        </Field>
      ) : mode === "date" ? (
        <Field label={t("closures.date")}>
          <Input
            type="date"
            value={v.date ?? ""}
            onChange={(e) => setV({ ...v, date: e.target.value || null })}
            required
          />
        </Field>
      ) : (
        <div />
      )}
      <Field label={t("closures.from")}>
        <Input
          type="time"
          value={v.startTime ?? ""}
          onChange={(e) => setV({ ...v, startTime: e.target.value || null })}
        />
      </Field>
      <Field label={t("closures.to")}>
        <Input
          type="time"
          value={v.endTime ?? ""}
          onChange={(e) => setV({ ...v, endTime: e.target.value || null })}
        />
      </Field>
      <Field label={t("closures.maxCovers")}>
        <Input
          type="number"
          min={0}
          value={v.maxCovers ?? ""}
          onChange={(e) => setV({ ...v, maxCovers: numOrNull(e.target.value) })}
        />
      </Field>
      <Field label={t("closures.maxBookings")}>
        <Input
          type="number"
          min={0}
          value={v.maxBookings ?? ""}
          onChange={(e) => setV({ ...v, maxBookings: numOrNull(e.target.value) })}
        />
      </Field>
      <Field label={t("closures.maxParty")}>
        <Input
          type="number"
          min={1}
          value={v.maxPartySize ?? ""}
          onChange={(e) => setV({ ...v, maxPartySize: numOrNull(e.target.value) })}
        />
      </Field>
      <div className="flex items-center gap-3 self-end pb-2">
        <Switch
          checked={v.active}
          onChange={(active) => setV({ ...v, active })}
          label={t("closures.active")}
        />
        <span className="text-sm">{t("closures.active")}</span>
      </div>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={busy}>
          {t("app.save")}
        </Button>
      </div>
    </form>
  );
}
