import type { BookingDto, CreateStaffBookingInput, RestaurantDto } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Field, Input, Select, Textarea } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { availabilityQuery } from "@/lib/queries";

export function BookingFormDialog({
  restaurant,
  date,
  open,
  onClose,
  canOverride,
}: {
  restaurant: RestaurantDto;
  date: string;
  open: boolean;
  onClose: () => void;
  canOverride: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [partySize, setPartySize] = useState(2);
  const [day, setDay] = useState(date);
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const availability = useQuery({
    ...availabilityQuery(restaurant.slug, day, partySize),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (body: CreateStaffBookingInput) =>
      api.post<BookingDto>(`/api/v1/restaurants/${restaurant.id}/bookings`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const [serviceId, startsAt] = slot.split("|");
    if (!serviceId || !startsAt) return;
    setError(null);
    create.mutate({
      serviceId,
      startsAt,
      partySize,
      customer: {
        name: String(f.get("name")),
        phone: String(f.get("phone") || "") || undefined,
        email: String(f.get("email") || "") || undefined,
      },
      notes: String(f.get("notes") || "") || undefined,
      source: String(f.get("source")) as CreateStaffBookingInput["source"],
      seatNow: f.get("seatNow") === "on",
      ignoreCapacity: f.get("ignoreCapacity") === "on",
      notifyGuest: true,
    });
  };

  const slots = availability.data?.slots ?? [];
  const services = availability.data?.services ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={t("today.newBooking")}>
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
            <option value="">{slots.length === 0 ? t("today.form.noSlots") : "—"}</option>
            {slots.map((s) => (
              <option
                key={`${s.serviceId}|${s.startsAt}`}
                value={`${s.serviceId}|${s.startsAt}`}
                disabled={!s.available && !canOverride}
              >
                {s.startLocal}
                {services.length > 1
                  ? ` · ${services.find((x) => x.id === s.serviceId)?.name ?? ""}`
                  : ""}
                {!s.available ? ` (${s.reason === "full" ? t("today.form.full") : s.reason})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("today.form.name")} className="sm:col-span-2">
          <Input name="name" required />
        </Field>
        <Field label={t("today.form.phone")}>
          <Input name="phone" type="tel" />
        </Field>
        <Field label={t("today.form.email")}>
          <Input name="email" type="email" />
        </Field>
        <Field label={t("today.form.source")}>
          <Select name="source" defaultValue="phone">
            <option value="phone">{t("today.source.phone")}</option>
            <option value="walk_in">{t("today.source.walk_in")}</option>
            <option value="manual">{t("today.source.manual")}</option>
          </Select>
        </Field>
        <Field label={t("today.form.notes")} className="sm:col-span-2">
          <Textarea name="notes" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="seatNow" /> {t("today.form.seatNow")}
        </label>
        {canOverride ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="ignoreCapacity" /> {t("today.form.ignoreCapacity")}
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
          <Button type="submit" loading={create.isPending} disabled={!slot}>
            {t("today.form.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
