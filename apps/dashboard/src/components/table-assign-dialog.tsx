import type { BookingDto, TableDto } from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";

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

  return (
    <Dialog open onClose={onClose} title={t("today.assignTables")}>
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">
          {booking.customer.name} · {booking.partySize}
          {chosen.size > 0 ? ` · ${t("today.seatsChosen", { count: seats })}` : ""}
        </p>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("tables.empty")}</p>
        ) : (
          <ul className="max-h-80 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200">
            {active.map((x) => {
              const by = occupantOf(x, booking, dayBookings);
              return (
                <li key={x.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen.has(x.id)}
                      onChange={(e) => {
                        const next = new Set(chosen);
                        if (e.target.checked) next.add(x.id);
                        else next.delete(x.id);
                        setChosen(next);
                      }}
                    />
                    <span className="w-14 font-medium">{x.name}</span>
                    <span className="text-zinc-500">
                      {t("tables.seats", { min: x.minCovers, max: x.maxCovers })}
                    </span>
                    {by ? (
                      <span className="ml-auto text-xs text-amber-700">
                        {t("today.takenBy", { name: by.customer.name })}
                      </span>
                    ) : (
                      <span className="ml-auto text-xs text-emerald-700">{t("today.free")}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {conflict ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            {t("today.seatAnyway")}
          </label>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t("app.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
