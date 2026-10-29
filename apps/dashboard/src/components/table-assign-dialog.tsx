import { joinedCapacity, tableLinks } from "@openpax/core";
import type { AreaDto, BookingDto, TableDto } from "@openpax/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FloorPlan } from "@/components/floor-plan";
import { Alert, Button, Checkbox, Dialog } from "@/components/ui";
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

/**
 * Pick the tables of a booking on the floor plan: tap to add or remove. Taken
 * tables show who sits there and need "seat anyway".
 */
export function TableAssignDialog({
  restaurantId,
  booking,
  tables,
  areas,
  dayBookings,
  onClose,
}: {
  restaurantId: string;
  booking: BookingDto;
  tables: TableDto[];
  areas: AreaDto[];
  dayBookings: BookingDto[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<Set<string>>(new Set(booking.tables.map((x) => x.id)));
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // the server saw a clash this screen did not (e.g. a booking made meanwhile)
  const [takenOnServer, setTakenOnServer] = useState(false);
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
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === "table_taken") setTakenOnServer(true);
      setError(
        e instanceof ApiClientError && e.code === "table_taken"
          ? t("today.tableTaken")
          : e instanceof ApiClientError
            ? e.message
            : t("app.error"),
      );
    },
  });
  const active = tables.filter((x) => x.active);
  // head seats count only where the plan allows them
  const seats = joinedCapacity(
    active.filter((x) => chosen.has(x.id)),
    tableLinks(active),
  ).max;
  const conflict =
    takenOnServer || active.some((x) => chosen.has(x.id) && occupantOf(x, booking, dayBookings));
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
      size="xl"
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
          <FloorPlan
            tables={active}
            areas={areas.filter((a) => a.active)}
            selectedIds={chosen}
            onSelect={(x) => toggle(x.id)}
            statusOf={(x) => {
              const by = occupantOf(x, booking, dayBookings);
              return by
                ? {
                    tone: "reserved",
                    label: by.customer.name,
                    title: t("today.takenBy", { name: by.customer.name }),
                  }
                : { tone: "free" };
            }}
          />
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
