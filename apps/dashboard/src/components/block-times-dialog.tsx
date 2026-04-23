import type { CapacityRuleDto, ServiceDto, UpsertCapacityRuleInput } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { capacityRulesQuery, servicesQuery, staffAvailabilityQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

/*
 * "Block times" keeps online bookings away from some times of one day (a
 * Saturday evening that is full from the phone, a private event). Each block
 * is a capacity rule with zero covers over one run of slots of a service, so
 * the engine, the widget and the settings page all see it as an ordinary
 * rule and managers can still book those times by hand, ignoring the limits.
 */

/** A zero-cover rule on exactly this day with a time range: what the dialog creates and manages. */
export function isBlockRule(r: CapacityRuleDto, date: string): boolean {
  return (
    r.active &&
    r.maxCovers === 0 &&
    r.date === date &&
    (r.endDate === null || r.endDate === date) &&
    r.weekday === null &&
    r.areaId === null &&
    r.startTime !== null &&
    r.endTime !== null
  );
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const toHhmm = (minutes: number): string => {
  const v = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/** Same window test as the engine: start inclusive, end exclusive, wrapping past midnight. */
function inRule(r: CapacityRuleDto, serviceId: string, startLocal: string): boolean {
  if (r.serviceId !== null && r.serviceId !== serviceId) return false;
  const start = toMinutes(r.startTime ?? "00:00");
  const end = r.endTime === null ? 1440 : toMinutes(r.endTime);
  const wall = toMinutes(startLocal);
  return end <= start ? wall >= start || wall < end : wall >= start && wall < end;
}

/** The slot times a block rule covers, stepping by its service's interval. */
function ruleSlots(r: CapacityRuleDto, services: ServiceDto[]): string[] {
  const svc = services.find((s) => s.id === r.serviceId) ?? services[0];
  const step = svc?.slotIntervalMinutes ?? 30;
  const start = toMinutes(r.startTime ?? "00:00");
  let end = r.endTime === null ? 1440 : toMinutes(r.endTime);
  if (end <= start) end += 1440;
  const out: string[] = [];
  for (let m = start; m < end && out.length < 96; m += step) out.push(toHhmm(m));
  return out;
}

/** Banner on Today listing the times stopped for online bookings. */
export function BlockedTimesNotice({
  restaurantId,
  blocks,
  onEdit,
}: {
  restaurantId: string;
  blocks: CapacityRuleDto[];
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const services = useQuery(servicesQuery(restaurantId));
  const list = services.data ?? [];
  const multi = list.length > 1;
  const text = [...blocks]
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .map((r) => {
      const times = ruleSlots(r, list).join(", ");
      const name = multi && r.serviceId ? list.find((s) => s.id === r.serviceId)?.name : null;
      return name ? `${name} ${times}` : times;
    })
    .join(" · ");
  return (
    <Alert tone="info" className="mt-4 print:hidden">
      <span className="font-semibold">{t("today.blockedTimes")}</span>
      {": "}
      {text}
      {onEdit ? (
        <>
          {" · "}
          <button
            type="button"
            onClick={onEdit}
            className="font-semibold underline underline-offset-2"
          >
            {t("today.blockChange")}
          </button>
        </>
      ) : null}
    </Alert>
  );
}

/** Tap the times of the day to block or reopen them for online bookings. */
export function BlockTimesDialog({
  restaurantId,
  date,
  onClose,
}: {
  restaurantId: string;
  date: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const services = useQuery(servicesQuery(restaurantId));
  const rules = useQuery(capacityRulesQuery(restaurantId));
  // every slot of the day without the online-only rules; party size 1 so nothing hides for size
  const availability = useQuery(staffAvailabilityQuery(restaurantId, date, 1));
  const [picked, setPicked] = useState<Set<string> | null>(null);

  const list = services.data ?? [];
  const blocks = (rules.data ?? []).filter((r) => isBlockRule(r, date));
  const slots = availability.data?.slots ?? [];
  const keyOf = (s: { serviceId: string; startLocal: string }) => `${s.serviceId}|${s.startLocal}`;
  const initial = new Set(
    slots.filter((s) => blocks.some((r) => inRule(r, s.serviceId, s.startLocal))).map(keyOf),
  );
  const current = picked ?? initial;
  const changed = current.size !== initial.size || [...current].some((k) => !initial.has(k));
  const toggle = (k: string) => {
    const next = new Set(current);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setPicked(next);
  };

  const save = useMutation({
    mutationFn: async () => {
      // rebuild this day's blocks from the ticks: one rule per run of consecutive slots of a service
      const bodies: UpsertCapacityRuleInput[] = [];
      for (const svc of list) {
        const step = svc.slotIntervalMinutes * 60_000;
        const runs: Array<typeof slots> = [];
        let run: typeof slots = [];
        for (const s of slots) {
          if (s.serviceId !== svc.id || !current.has(keyOf(s))) continue;
          const last = run[run.length - 1];
          if (last && new Date(s.startsAt).getTime() - new Date(last.startsAt).getTime() !== step) {
            runs.push(run);
            run = [];
          }
          run.push(s);
        }
        if (run.length > 0) runs.push(run);
        for (const r of runs) {
          const first = r[0];
          const last = r[r.length - 1];
          if (!first || !last) continue;
          bodies.push({
            name: t("today.blockRuleName"),
            serviceId: svc.id,
            areaId: null,
            weekday: null,
            date,
            endDate: null,
            startTime: first.startLocal,
            endTime: toHhmm(toMinutes(last.startLocal) + svc.slotIntervalMinutes),
            maxCovers: 0,
            maxBookings: null,
            maxPartySize: null,
            active: true,
          });
        }
      }
      const base = `/api/v1/restaurants/${restaurantId}/capacity-rules`;
      await Promise.all(blocks.map((r) => api.delete(`${base}/${r.id}`)));
      await Promise.all(bodies.map((b) => api.post(base, b)));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "capacity-rules"] }),
        queryClient.invalidateQueries({ queryKey: ["availability"] }),
      ]);
      toast.success(t("app.saved"));
      onClose();
    },
    onError: () => toast.error(t("app.error")),
  });

  const groups = list
    .map((svc) => ({ svc, slots: slots.filter((s) => s.serviceId === svc.id) }))
    .filter((g) => g.slots.length > 0);

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("today.blockTimes")}
      description={t("today.blockTimesHint")}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button loading={save.isPending} disabled={!changed} onClick={() => save.mutate()}>
            {t("app.save")}
          </Button>
        </>
      }
    >
      {availability.isLoading || rules.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">
          {t("today.blockNoSlots")}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-stone-500">{t("today.blockLegend")}</p>
          {groups.map((g) => (
            <div key={g.svc.id}>
              {groups.length > 1 ? (
                <p className="mb-1.5 text-[13px] font-semibold text-stone-500 uppercase tracking-wide">
                  {g.svc.name}
                </p>
              ) : null}
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {g.slots.map((s) => {
                  const k = keyOf(s);
                  const blocked = current.has(k);
                  const past = !s.available && s.reason === "in_past";
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={past}
                      aria-pressed={blocked}
                      onClick={() => toggle(k)}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-xl border text-[15px] font-semibold tabular-nums transition-colors",
                        blocked
                          ? "border-red-300 bg-red-50 text-red-800 line-through decoration-red-400"
                          : "border-stone-300 bg-white text-stone-800 hover:border-brand-400 hover:bg-brand-50",
                        past && "cursor-not-allowed opacity-40",
                      )}
                    >
                      {s.startLocal}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
