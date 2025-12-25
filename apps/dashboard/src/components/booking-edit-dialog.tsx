import type { BookingDto, RestaurantDto, UpdateBookingInput } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { availabilityQuery } from "@/lib/queries";
import { formatTime } from "@/lib/utils";

const at = (iso: string) => new Date(iso).getTime();

export function BookingEditDialog({
  restaurant,
  booking,
  open,
  onClose,
  canOverride,
}: {
  restaurant: RestaurantDto;
  booking: BookingDto;
  open: boolean;
  onClose: () => void;
  canOverride: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [partySize, setPartySize] = useState(booking.partySize);
  const [day, setDay] = useState(booking.serviceDate);
  const [slot, setSlot] = useState(`${booking.serviceId}|${at(booking.startsAt)}`);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [ignoreCapacity, setIgnoreCapacity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availability = useQuery({
    ...availabilityQuery(restaurant.slug, day, partySize),
    enabled: open,
  });

  const update = useMutation({
    mutationFn: (body: UpdateBookingInput) =>
      api.patch<BookingDto>(`/api/v1/restaurants/${restaurant.id}/bookings/${booking.id}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code === "slot_unavailable")
        setError(
          t("today.form.slotUnavailable", {
            reason: t(`today.form.reason.${e.reason ?? "not_a_slot"}`, {
              defaultValue: e.reason ?? "",
            }),
          }),
        );
      else setError(e instanceof ApiClientError ? e.message : t("app.error"));
    },
  });

  const slots = availability.data?.slots ?? [];
  const services = availability.data?.services ?? [];
  const currentKey = `${booking.serviceId}|${at(booking.startsAt)}`;
  const options = slots.map((s) => ({
    key: `${s.serviceId}|${at(s.startsAt)}`,
    startsAt: s.startsAt,
    serviceId: s.serviceId,
    label: `${s.startLocal}${
      services.length > 1 ? ` · ${services.find((x) => x.id === s.serviceId)?.name ?? ""}` : ""
    }`,
    available: s.available,
    reason: s.reason,
  }));
  // The booking's own slot always stays selectable, even when it shows as full because of itself.
  if (day === booking.serviceDate && !options.some((o) => o.key === currentKey)) {
    options.unshift({
      key: currentKey,
      startsAt: booking.startsAt,
      serviceId: booking.serviceId,
      label: `${formatTime(booking.startsAt, restaurant.timezone, i18n.language)} · ${booking.serviceName}`,
      available: true,
      reason: undefined,
    });
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const chosen = options.find((o) => o.key === slot);
    if (!chosen) return;
    const body: UpdateBookingInput = { ignoreCapacity, notifyGuest: true };
    if (chosen.serviceId !== booking.serviceId) body.serviceId = chosen.serviceId;
    if (at(chosen.startsAt) !== at(booking.startsAt)) body.startsAt = chosen.startsAt;
    if (partySize !== booking.partySize) body.partySize = partySize;
    const trimmed = notes.trim();
    if (trimmed !== (booking.notes ?? "")) body.notes = trimmed || null;
    if (Object.keys(body).length === 2) {
      setError(t("today.form.noChanges"));
      return;
    }
    setError(null);
    update.mutate(body);
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("today.editBooking")}>
      <p className="mb-3 text-sm text-zinc-500">
        {booking.customer.name} · <span className="font-mono">{booking.confirmationCode}</span>
      </p>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label={t("today.form.date")}>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </Field>
        <Field label={t("today.form.party")}>
          <Input
            type="number"
            min={1}
            max={100}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value) || 1)}
            required
          />
        </Field>
        <Field label={t("today.form.slot")} className="sm:col-span-2">
          <Select value={slot} onChange={(e) => setSlot(e.target.value)} required>
            {options.length === 0 ? <option value="">{t("today.form.noSlots")}</option> : null}
            {options.map((o) => (
              <option
                key={o.key}
                value={o.key}
                disabled={!o.available && !canOverride && o.key !== currentKey}
              >
                {o.label}
                {o.key === currentKey ? ` (${t("today.form.current")})` : ""}
                {!o.available && o.key !== currentKey
                  ? ` (${t(`today.form.reason.${o.reason ?? "full"}`, { defaultValue: o.reason })})`
                  : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("today.form.notes")} className="sm:col-span-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        {canOverride ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={ignoreCapacity}
              onChange={(e) => setIgnoreCapacity(e.target.checked)}
            />{" "}
            {t("today.form.ignoreCapacity")}
          </label>
        ) : null}
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!slot}>
            {t("today.form.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
