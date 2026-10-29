import { ACTIVE_BOOKING_STATUSES, joinedCapacity, tableLinks } from "@openpax/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { areasQuery, bookingsQuery, tablesQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * "Which table?" on a new booking: automatic, or the tables the guest asked
 * for (by the oven, by the window). Tables taken at that time are greyed out.
 */
export function TablePicker({
  restaurantId,
  date,
  slot,
  partySize,
  value,
  onChange,
}: {
  restaurantId: string;
  date: string;
  slot: { startsAt: string; endsAt: string } | null;
  partySize: number;
  /** null = picked automatically. */
  value: string[] | null;
  onChange: (tableIds: string[] | null) => void;
}) {
  const { t } = useTranslation();
  const tables = useQuery(tablesQuery(restaurantId));
  const areas = useQuery(areasQuery(restaurantId));
  const day = useQuery({ ...bookingsQuery(restaurantId, date), enabled: date !== "" });
  const active = (tables.data ?? []).filter((x) => x.active);
  if (active.length === 0) return null;

  const taken = new Set<string>();
  if (slot) {
    for (const b of day.data?.items ?? []) {
      if (!ACTIVE_BOOKING_STATUSES.includes(b.status)) continue;
      if (b.startsAt >= slot.endsAt || b.endsAt <= slot.startsAt) continue;
      for (const x of b.tables) taken.add(x.id);
    }
  }
  const chosen = value ?? [];
  const seats = joinedCapacity(
    active.filter((x) => chosen.includes(x.id)),
    tableLinks(active),
  ).max;
  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const rooms = [
    ...(areas.data ?? []).map((a) => ({ id: a.id as string | null, name: a.name })),
    { id: null, name: t("tables.noArea") },
  ].filter((r) => active.some((x) => x.areaId === r.id));

  const mode = (on: boolean) =>
    cn(
      "h-12 flex-1 rounded-xl border-2 px-3 text-base font-semibold",
      on ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white text-stone-800",
    );

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-stone-700">{t("today.form.table")}</p>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={value === null}
          className={mode(value === null)}
          onClick={() => onChange(null)}
        >
          {t("today.form.tableAuto")}
        </button>
        <button
          type="button"
          aria-pressed={value !== null}
          className={mode(value !== null)}
          onClick={() => onChange(value ?? [])}
        >
          {t("today.form.tablePick")}
        </button>
      </div>
      {value !== null ? (
        <>
          {rooms.map((r) => (
            <div key={r.id ?? "none"}>
              {rooms.length > 1 ? <p className="mb-1.5 text-sm text-stone-500">{r.name}</p> : null}
              <div className="flex flex-wrap gap-2">
                {active
                  .filter((x) => x.areaId === r.id)
                  .map((x) => {
                    const on = chosen.includes(x.id);
                    const busy = taken.has(x.id) && !on;
                    return (
                      <button
                        key={x.id}
                        type="button"
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() => toggle(x.id)}
                        className={cn(
                          "h-12 min-w-12 rounded-xl border-2 px-3 text-base font-semibold tabular-nums",
                          on
                            ? "border-brand-600 bg-brand-600 text-white"
                            : busy
                              ? "cursor-not-allowed border-stone-200 bg-stone-100 text-stone-300"
                              : "border-stone-300 bg-white text-stone-800 hover:border-brand-400",
                        )}
                      >
                        {x.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          <p
            className={cn(
              "text-sm",
              chosen.length > 0 && seats < partySize ? "text-red-700" : "text-stone-500",
            )}
          >
            {chosen.length === 0
              ? t("today.form.tablePickHint")
              : t("today.form.tableSeats", { count: seats, guests: partySize })}
          </p>
        </>
      ) : null}
    </div>
  );
}
