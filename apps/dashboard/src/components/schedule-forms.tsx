import { WEEKDAYS } from "@sitli/core";
import type {
  AreaDto,
  CapacityRuleDto,
  ScheduleExceptionDto,
  ServiceDto,
  UpsertCapacityRuleInput,
  UpsertScheduleExceptionInput,
} from "@sitli/shared";
import { CalendarOff, Clock, Plus, Trash } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Field,
  IconButton,
  Input,
  Segmented,
  Select,
  Switch,
  Textarea,
} from "@/components/ui";

type Window = { start: string; end: string };
const numOrNull = (v: string) => (v === "" ? null : Number(v));

/** Opening windows of one day, as start–end pairs. */
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
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <Input
            type="time"
            value={w.start}
            className="h-10 w-[8.5rem] min-h-0 px-2.5 font-medium tabular-nums"
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
            }
            required
          />
          <span className="text-stone-400">–</span>
          <Input
            type="time"
            value={w.end}
            className="h-10 w-[8.5rem] min-h-0 px-2.5 font-medium tabular-nums"
            onChange={(e) =>
              onChange(value.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
            }
            required
          />
          <IconButton
            size="sm"
            label={t("app.delete")}
            className="text-stone-400 hover:text-red-600"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash />
          </IconButton>
        </div>
      ))}
      {value.length < 6 ? (
        <Button
          size="sm"
          variant="outline"
          icon={<Plus />}
          onClick={() => onChange([...value, { start: "12:00", end: "15:00" }])}
        >
          {t("closures.addWindow")}
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
  id,
}: {
  initial: UpsertScheduleExceptionInput;
  services: ServiceDto[];
  onSubmit: (v: UpsertScheduleExceptionInput) => void;
  busy: boolean;
  /** When set, the host renders the submit button (dialog footer) via `form={id}`. */
  id?: string;
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
    <form id={id} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label={t("closures.date")} required>
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
      <div className="sm:col-span-2">
        <Segmented
          value={v.closed ? "closed" : "special"}
          onChange={(mode) =>
            setV({
              ...v,
              closed: mode === "closed",
              windows: mode === "closed" ? null : (v.windows ?? [{ start: "19:00", end: "22:00" }]),
            })
          }
          options={[
            { value: "closed", label: t("closures.closedAllDay"), icon: <CalendarOff /> },
            { value: "special", label: t("closures.specialHours"), icon: <Clock /> },
          ]}
        />
      </div>
      {!v.closed ? (
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-medium text-stone-700">{t("closures.windows")}</p>
          <WindowsEditor value={v.windows ?? []} onChange={(windows) => setV({ ...v, windows })} />
        </div>
      ) : null}
      <Field label={t("closures.reason")} hint={t("closures.reasonHint")} className="sm:col-span-2">
        <Textarea
          value={v.reason ?? ""}
          maxLength={200}
          className="min-h-14"
          onChange={(e) => setV({ ...v, reason: e.target.value })}
        />
      </Field>
      {id ? null : (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={busy}>
            {t("app.save")}
          </Button>
        </div>
      )}
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
  id,
}: {
  initial: UpsertCapacityRuleInput;
  services: ServiceDto[];
  areas: AreaDto[];
  onSubmit: (v: UpsertCapacityRuleInput) => void;
  busy: boolean;
  /** When set, the host renders the submit button (dialog footer) via `form={id}`. */
  id?: string;
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
  // keep the select order stable: service, area, when, weekday (the e2e spec relies on it)
  return (
    <form id={id} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label={t("closures.name")} className="sm:col-span-2">
        <Input
          value={v.name ?? ""}
          maxLength={80}
          placeholder={t("closures.namePlaceholder")}
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
        <div className="hidden sm:block" />
      )}
      <Field label={t("closures.from")} hint={t("closures.timeHint")}>
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
      <div className="sm:col-span-2">
        <p className="mb-1 text-sm font-semibold text-stone-900 uppercase tracking-wide">
          {t("closures.limits")}
        </p>
        <p className="mb-3 text-[13px] text-stone-500">{t("closures.limitsHint")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("closures.maxCovers")}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={t("closures.noLimit")}
              value={v.maxCovers ?? ""}
              onChange={(e) => setV({ ...v, maxCovers: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label={t("closures.maxBookings")}>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={t("closures.noLimit")}
              value={v.maxBookings ?? ""}
              onChange={(e) => setV({ ...v, maxBookings: numOrNull(e.target.value) })}
            />
          </Field>
          <Field label={t("closures.maxParty")}>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              placeholder={t("closures.noLimit")}
              value={v.maxPartySize ?? ""}
              onChange={(e) => setV({ ...v, maxPartySize: numOrNull(e.target.value) })}
            />
          </Field>
        </div>
      </div>
      <div className="sm:col-span-2">
        <Switch
          checked={v.active}
          onChange={(active) => setV({ ...v, active })}
          label={t("closures.active")}
          description={t("closures.activeHint")}
        />
      </div>
      {id ? null : (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={busy}>
            {t("app.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
