import type { BookingDto, CreateStaffBookingInput, RestaurantDto } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { MeetingDialog } from "@/components/meeting-dialog";
import { SlotPicker } from "@/components/slot-picker";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  Select,
  Spinner,
  Stepper,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { areasQuery, policyQuery, staffAvailabilityQuery } from "@/lib/queries";

export function BookingFormDialog({
  restaurant,
  open,
  onClose,
  canOverride,
}: {
  restaurant: RestaurantDto;
  open: boolean;
  onClose: () => void;
  canOverride: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const [partySize, setPartySize] = useState(2);
  // no default day: whoever takes the booking must type the date the guest asked for
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPartySize(2);
    setDay("");
    setSlot("");
    setError(null);
    setWantsMeeting(false);
  }, [open]);
  // staff see every slot with room, without the online-only rules (notice, horizon, party size)
  const availability = useQuery({
    ...staffAvailabilityQuery(restaurant.id, day, partySize),
    enabled: open && day !== "",
  });
  const areas = useQuery({ ...areasQuery(restaurant.id), enabled: open });
  const rooms = (areas.data ?? []).filter((a) => a.active);
  const policy = useQuery({ ...policyQuery(restaurant.id), enabled: open });
  const operators = policy.data?.operators ?? [];
  const meetingFrom = policy.data?.meetingMinPartySize ?? null;
  const canMeet = meetingFrom !== null && partySize >= meetingFrom;
  const [wantsMeeting, setWantsMeeting] = useState(false);
  // the booking just created, waiting for its meeting slot
  const [meetingFor, setMeetingFor] = useState<BookingDto | null>(null);

  const create = useMutation({
    mutationFn: (body: CreateStaffBookingInput) =>
      api.post<BookingDto>(`/api/v1/restaurants/${restaurant.id}/bookings`, body),
    onSuccess: async (b) => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
      toast.success(t("today.created", { name: b.customer.name }));
      if (wantsMeeting && canMeet) setMeetingFor(b);
      onClose();
    },
    onError: (e) =>
      setError(operatorError(e) ?? (e instanceof ApiClientError ? e.message : t("app.error"))),
  });
  const operatorError = (e: unknown) =>
    e instanceof ApiClientError && (e.code === "operator_required" || e.code === "unknown_operator")
      ? t(
          e.code === "operator_required"
            ? "today.form.operatorRequired"
            : "today.form.unknownOperator",
        )
      : null;

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
      areaId: String(f.get("areaId") || "") || undefined,
      source: String(f.get("source")) as CreateStaffBookingInput["source"],
      seatNow: f.get("seatNow") === "on",
      ignoreCapacity: f.get("ignoreCapacity") === "on",
      notifyGuest: f.get("notifyGuest") === "on",
      operatorName: String(f.get("operatorName") || "") || undefined,
    });
  };

  const slots = availability.data?.slots ?? [];
  const services = availability.data?.services ?? [];

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title={t("today.newBooking")}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("app.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={create.isPending} disabled={!slot}>
              {t("today.form.create")}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("today.form.date")}>
            <Input
              type="date"
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setSlot("");
              }}
              required
            />
          </Field>
          <Field label={t("today.form.party")}>
            <Stepper
              value={partySize}
              onChange={setPartySize}
              min={1}
              max={100}
              ariaLabel={t("today.form.party")}
            />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium text-stone-700">{t("today.form.slot")}</p>
            {day === "" ? (
              <p className="text-sm text-stone-500">{t("today.form.pickDateFirst")}</p>
            ) : availability.isLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : (
              <SlotPicker
                options={slots.map((s) => ({
                  key: `${s.serviceId}|${s.startsAt}`,
                  serviceId: s.serviceId,
                  label: s.startLocal,
                  available: s.available,
                  reason: s.reason,
                }))}
                services={services}
                value={slot}
                onChange={setSlot}
                allowUnavailable={canOverride}
                emptyLabel={t("today.form.noSlots")}
              />
            )}
          </div>
          <Field label={t("today.form.name")} className="sm:col-span-2" required>
            <Input name="name" required autoComplete="off" />
          </Field>
          <Field label={t("today.form.phone")}>
            <Input name="phone" type="tel" inputMode="tel" autoComplete="off" />
          </Field>
          <Field label={t("today.form.email")}>
            <Input name="email" type="email" inputMode="email" autoComplete="off" />
          </Field>
          {operators.length > 0 ? (
            <Field label={t("today.form.operator")} required>
              <Select name="operatorName" defaultValue="" required>
                <option value="" disabled>
                  {t("today.form.operatorChoose")}
                </option>
                {operators.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t("today.form.source")}>
            <Select name="source" defaultValue="phone">
              <option value="phone">{t("today.source.phone")}</option>
              <option value="walk_in">{t("today.source.walk_in")}</option>
              <option value="manual">{t("today.source.manual")}</option>
            </Select>
          </Field>
          {rooms.length > 0 ? (
            <Field label={t("today.form.room")}>
              <Select name="areaId" defaultValue="">
                <option value="">{t("today.form.anyRoom")}</option>
                {rooms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t("today.form.notes")} className="sm:col-span-2">
            <Textarea name="notes" placeholder={t("today.form.notesPlaceholder")} />
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <Checkbox
              name="notifyGuest"
              defaultChecked
              label={t("today.form.notifyGuest")}
              description={t("today.form.notifyGuestHint")}
            />
            <Checkbox name="seatNow" label={t("today.form.seatNow")} />
            {canMeet ? (
              <Checkbox
                checked={wantsMeeting}
                onChange={(e) => setWantsMeeting(e.target.checked)}
                label={t("meetings.wants", {
                  host: policy.data?.meetingHostName || t("meetings.hostFallback"),
                })}
                description={t("meetings.wantsHint")}
              />
            ) : null}
            {canOverride ? (
              <Checkbox
                name="ignoreCapacity"
                label={t("today.form.ignoreCapacity")}
                description={t("today.form.ignoreCapacityHint")}
              />
            ) : null}
          </div>
          {error ? (
            <div className="sm:col-span-2">
              <Alert>{error}</Alert>
            </div>
          ) : null}
        </form>
      </Dialog>
      {meetingFor ? (
        <MeetingDialog
          restaurant={restaurant}
          booking={meetingFor}
          current={null}
          open
          onClose={() => setMeetingFor(null)}
        />
      ) : null}
    </>
  );
}
