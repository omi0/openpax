import type { BookingDto, TableDto } from "@openpax/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Checkbox, Dialog } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACTIVE = new Set(["pending", "confirmed", "seated"]);
const at = (iso: string) => new Date(iso).getTime();

/** Which active booking (other than `self`) sits at `table` while `self` is there. */
export function occupantOf(
  table: TableDto,
  self: { id: string; startsAt: string; endsAt: string },
  bookings: BookingDto[],
): BookingDto | null {
  for (const b of bookings) {
    if (b.id === self.id || !ACTIVE.has(b.status)) continue;
    if (!b.tables.some((x) => x.id === table.id)) continue;
    if (at(b.startsAt) < at(self.endsAt) && at(b.endsAt) > at(self.startsAt)) return b;
  }
  return null;
}

/** Pick the tables of a booking by hand; taken tables are flagged and need "seat anyway". */
export function TableAssignDialog({
  restaurantId,
  booking,
  tables,
  dayBookings,
  onClose,
}: {
  restaurantId: string;
  booking: BookingDto;
  tables: TableDto[];
  dayBookings: BookingDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Set<string>>(new Set(booking.tables.map((x) => x.id)));
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/restaurants/${restaurantId}/bookings/${booking.id}/tables`, {
        tableIds: [...chosen],
        force,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const active = tables.filter((x) => x.active);
  const seats = active.filter((x) => chosen.has(x.id)).reduce((n, x) => n + x.maxCovers, 0);
  const conflict = active.some((x) => chosen.has(x.id) && occupantOf(x, booking, dayBookings));
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("today.assignTables")}
      description={`${booking.customer.name} · ${t("today.guests", { count: booking.partySize })}${
        chosen.size > 0 ? ` · ${t("today.seatsChosen", { count: seats })}` : ""
      }`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t("app.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {active.length === 0 ? (
          <p className="text-sm text-stone-500">{t("tables.empty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {active.map((x) => {
              const by = occupantOf(x, booking, dayBookings);
              const on = chosen.has(x.id);
              return (
                <li key={x.id}>
                  <label
                    className={cn(
                      "flex h-full cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors",
                      on
                        ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20"
                        : by
                          ? "border-amber-300 bg-amber-50/60 hover:bg-amber-50"
                          : "border-stone-200 bg-white hover:border-stone-300",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-semibold">{x.name}</span>
                      <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          className="peer size-5 appearance-none rounded-md border border-stone-300 bg-white transition checked:border-brand-600 checked:bg-brand-600"
                          checked={on}
                          onChange={() => toggle(x.id)}
                          aria-label={x.name}
                        />
                        <Check
                          className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100"
                          strokeWidth={3}
                        />
                      </span>
                    </span>
                    <span className="text-[13px] text-stone-500">
                      {t("tables.seats", { min: x.minCovers, max: x.maxCovers })}
                    </span>
                    <span
                      className={cn(
                        "text-[13px] font-medium",
                        by ? "text-amber-700" : "text-emerald-700 capitalize",
                      )}
                    >
                      {by ? t("today.takenBy", { name: by.customer.name }) : t("today.free")}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {conflict ? (
          <Checkbox
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            label={t("today.seatAnyway")}
          />
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>
    </Dialog>
  );
}
