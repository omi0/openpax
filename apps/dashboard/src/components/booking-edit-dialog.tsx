import type { BookingDto, RestaurantDto, UpdateBookingInput } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { OperatorGate, type VerifiedOperator } from "@/components/operator-gate";
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
import { areasQuery, operatorsQuery, staffAvailabilityQuery } from "@/lib/queries";
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const [partySize, setPartySize] = useState(booking.partySize);
  const [day, setDay] = useState(booking.serviceDate);
  const [slot, setSlot] = useState(`${booking.serviceId}|${at(booking.startsAt)}`);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [areaId, setAreaId] = useState<string | null>(booking.areaId);
  const [operatorName, setOperatorName] = useState(booking.operatorName ?? "");
  const [ignoreCapacity, setIgnoreCapacity] = useState(false);
  const [notifyGuest, setNotifyGuest] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availability = useQuery({
    ...staffAvailabilityQuery(restaurant.id, day, partySize),
    enabled: open,
  });
  const areas = useQuery({ ...areasQuery(restaurant.id), enabled: open });
  // open rooms, plus the booking's own room even when it is closed for now
  const rooms = (areas.data ?? []).filter((a) => a.active || a.id === booking.areaId);
  // with operators, whoever changes the booking says who they are first (name + code)
  const operatorList = useQuery({ ...operatorsQuery(restaurant.id), enabled: open });
  const [operator, setOperator] = useState<VerifiedOperator | null>(null);
  useEffect(() => {
    if (open) setOperator(null);
  }, [open]);
  const needsOperator = (operatorList.data?.length ?? 0) > 0;
  const gateOpen = open && needsOperator && operator === null;
  const formOpen = open && operatorList.isSuccess && (!needsOperator || operator !== null);
  // managers may correct who took it: the list, plus the booking's own name if removed since
  const listed = (operatorList.data ?? []).map((o) => o.name);
  const operators =
    booking.operatorName && !listed.includes(booking.operatorName)
      ? [booking.operatorName, ...listed]
      : listed;

  const update = useMutation({
    mutationFn: (body: UpdateBookingInput) =>
      api.patch<BookingDto>(`/api/v1/restaurants/${restaurant.id}/bookings/${booking.id}`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "bookings"] });
      await queryClient.invalidateQueries({ queryKey: ["availability"] });
      toast.success(t("app.saved"));
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
      else if (
        e instanceof ApiClientError &&
        (e.code === "wrong_pin" || e.code === "operator_locked")
      ) {
        setOperator(null);
        setError(t("operators.askAgain"));
      } else if (e instanceof ApiClientError && e.code === "unknown_operator")
        setError(t("today.form.unknownOperator"));
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
    label: s.startLocal,
    available: s.available,
    reason: s.reason,
    current: day === booking.serviceDate && `${s.serviceId}|${at(s.startsAt)}` === currentKey,
  }));
  // The booking's own slot always stays selectable, even when it shows as full because of itself.
  if (day === booking.serviceDate && !options.some((o) => o.key === currentKey)) {
    options.unshift({
      key: currentKey,
      startsAt: booking.startsAt,
      serviceId: booking.serviceId,
      label: formatTime(booking.startsAt, restaurant.timezone, i18n.language),
      available: true,
      reason: undefined,
      current: true,
    });
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const chosen = options.find((o) => o.key === slot);
    if (!chosen) return;
    const body: UpdateBookingInput = { ignoreCapacity, notifyGuest };
    if (chosen.serviceId !== booking.serviceId) body.serviceId = chosen.serviceId;
    if (at(chosen.startsAt) !== at(booking.startsAt)) body.startsAt = chosen.startsAt;
    if (partySize !== booking.partySize) body.partySize = partySize;
    const trimmed = notes.trim();
    if (trimmed !== (booking.notes ?? "")) body.notes = trimmed || null;
    if (areaId !== booking.areaId) body.areaId = areaId;
    if (canOverride && operatorName !== (booking.operatorName ?? ""))
      body.operatorName = operatorName || null;
    if (Object.keys(body).length === 2) {
      setError(t("today.form.noChanges"));
      return;
    }
    if (operator) body.operator = { id: operator.id, pin: operator.pin };
    setError(null);
    update.mutate(body);
  };

  return (
    <>
      <OperatorGate
        restaurantId={restaurant.id}
        operators={operatorList.data ?? []}
        open={gateOpen}
        title={t("operators.whoIsChanging")}
        onCancel={onClose}
        onVerified={setOperator}
      />
      <Dialog
        open={formOpen}
        onClose={onClose}
        title={t("today.editBooking")}
        description={`${booking.customer.name} · ${booking.confirmationCode}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("app.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={update.isPending} disabled={!slot}>
              {t("today.form.save")}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("today.form.date")}>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
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
            {availability.isLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : (
              <SlotPicker
                options={options}
                services={services}
                value={slot}
                onChange={setSlot}
                allowUnavailable={canOverride}
                emptyLabel={t("today.form.noSlots")}
              />
            )}
          </div>
          {rooms.length > 0 ? (
            <Field label={t("today.form.room")}>
              <Select value={areaId ?? ""} onChange={(e) => setAreaId(e.target.value || null)}>
                <option value="">{t("today.form.anyRoom")}</option>
                {rooms.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {canOverride && operators.length > 0 ? (
            <Field label={t("today.operatorLabel")} hint={t("operators.correctHint")}>
              <Select value={operatorName} onChange={(e) => setOperatorName(e.target.value)}>
                <option value="">{t("today.form.operatorChoose")}</option>
                {operators.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t("today.form.notes")} className="sm:col-span-2">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <Checkbox
              checked={notifyGuest}
              onChange={(e) => setNotifyGuest(e.target.checked)}
              label={t("today.form.notifyChange")}
              description={t("today.form.notifyChangeHint")}
            />
            {canOverride ? (
              <Checkbox
                checked={ignoreCapacity}
                onChange={(e) => setIgnoreCapacity(e.target.checked)}
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
    </>
  );
}
