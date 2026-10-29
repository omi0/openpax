import type { BookingDto, MeetingDto, RestaurantDto } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Dialog,
  Field,
  Input,
  Spinner,
  useConfirm,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { bookingMeetingQuery, meetingSlotsQuery, policyQuery } from "@/lib/queries";
import { cn, formatDateTime, todayLocal } from "@/lib/utils";

/** Pick one of the host's free 30-minute slots for a group booking (or move the current one). */
export function MeetingDialog({
  restaurant,
  booking,
  current,
  open,
  onClose,
}: {
  restaurant: RestaurantDto;
  booking: BookingDto;
  current: MeetingDto | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setDay("");
    setSlot("");
    setError(null);
  }, [open]);
  const policy = useQuery({ ...policyQuery(restaurant.id), enabled: open });
  const slots = useQuery({ ...meetingSlotsQuery(restaurant.id, day), enabled: open && day !== "" });
  const host = policy.data?.meetingHostName || t("meetings.hostFallback");

  const save = useMutation({
    mutationFn: (startsAt: string) =>
      api.put<MeetingDto>(`/api/v1/restaurants/${restaurant.id}/bookings/${booking.id}/meeting`, {
        startsAt,
      }),
    onSuccess: async (m) => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "meetings"] });
      toast.success(
        t("meetings.saved", {
          host,
          when: formatDateTime(m.startsAt, restaurant.timezone, i18n.language),
        }),
      );
      onClose();
    },
    onError: async (e) => {
      if (e instanceof ApiClientError && e.code === "meeting_slot_taken") {
        setError(t("meetings.taken"));
        setSlot("");
        await queryClient.invalidateQueries({
          queryKey: ["restaurant", restaurant.id, "meetings"],
        });
      } else if (e instanceof ApiClientError && e.code === "meeting_after_event")
        setError(t("meetings.afterEvent"));
      else setError(e instanceof ApiClientError ? e.message : t("app.error"));
    },
  });

  const free = (slots.data?.slots ?? []).filter((s) => s.available);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={current ? t("meetings.move", { host }) : t("meetings.book", { host })}
      description={`${booking.customer.name} · ${t("today.guests", { count: booking.partySize })}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button onClick={() => save.mutate(slot)} loading={save.isPending} disabled={!slot}>
            {t("meetings.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {current ? (
          <p className="text-sm text-stone-600">
            {t("meetings.currently", {
              when: formatDateTime(current.startsAt, restaurant.timezone, i18n.language),
            })}
          </p>
        ) : null}
        <Field label={t("meetings.day")} required>
          <Input
            type="date"
            value={day}
            min={todayLocal(restaurant.timezone)}
            max={booking.serviceDate}
            onChange={(e) => {
              setDay(e.target.value);
              setSlot("");
            }}
            required
          />
        </Field>
        {day === "" ? (
          <p className="text-sm text-stone-500">{t("meetings.pickDay")}</p>
        ) : slots.isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : slots.data?.closed ? (
          <p className="text-sm text-stone-500">{t("meetings.closedDay")}</p>
        ) : free.length === 0 ? (
          <p className="text-sm text-stone-500">{t("meetings.noSlots", { host })}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {free.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                onClick={() => setSlot(s.startsAt)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-[15px] font-semibold tabular-nums",
                  slot === s.startsAt
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-stone-200 bg-white hover:border-brand-400",
                )}
              >
                {s.startLocal}
              </button>
            ))}
          </div>
        )}
        {error ? <Alert>{error}</Alert> : null}
      </div>
    </Dialog>
  );
}

/** The booking's meeting with the host in the booking sheet: book, move or cancel it. */
export function MeetingSection({
  restaurant,
  booking,
  active,
}: {
  restaurant: RestaurantDto;
  booking: BookingDto;
  active: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const policy = useQuery(policyQuery(restaurant.id));
  const meeting = useQuery(bookingMeetingQuery(restaurant.id, booking.id));
  const cancel = useMutation({
    mutationFn: () =>
      api.delete(`/api/v1/restaurants/${restaurant.id}/bookings/${booking.id}/meeting`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "meetings"] });
      toast.success(t("meetings.cancelled"));
    },
    onError: () => toast.error(t("app.error")),
  });

  const from = policy.data?.meetingMinPartySize ?? null;
  const current = meeting.data ?? null;
  const eligible = active && from !== null && booking.partySize >= from;
  if (!current && !eligible) return null;
  const host = policy.data?.meetingHostName || t("meetings.hostFallback");

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-stone-200 px-3.5 py-3">
      <ChefHat className="size-[18px] shrink-0 text-brand-700" />
      <p className="min-w-0 flex-1 basis-40 text-[15px]">
        {current ? (
          <>
            <span className="font-semibold">{t("meetings.with", { host })}</span>{" "}
            <span className="capitalize tabular-nums">
              {formatDateTime(current.startsAt, restaurant.timezone, i18n.language)}
            </span>
          </>
        ) : (
          <span className="text-stone-600">{t("meetings.none", { host })}</span>
        )}
      </p>
      {active ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {current ? t("meetings.moveShort") : t("meetings.bookShort")}
          </Button>
          {current ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-stone-500 hover:text-red-700"
              loading={cancel.isPending}
              onClick={async () => {
                if (
                  await confirm({
                    title: t("meetings.confirmCancel", { host }),
                    confirmLabel: t("meetings.cancelShort"),
                  })
                )
                  cancel.mutate();
              }}
            >
              {t("meetings.cancelShort")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <MeetingDialog
        restaurant={restaurant}
        booking={booking}
        current={current}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
