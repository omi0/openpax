import {
  type BookingDto,
  MEETING_MINUTES,
  type MeetingDto,
  type RestaurantDto,
} from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Spinner, useConfirm, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import {
  bookingMeetingQuery,
  meetingDaysQuery,
  meetingSlotsQuery,
  policyQuery,
} from "@/lib/queries";
import { addDays, cn, formatDateTime, todayLocal } from "@/lib/utils";

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

  // the meeting has to be over before the event starts
  const latest = new Date(booking.startsAt).getTime() - MEETING_MINUTES * 60_000;
  const free = (slots.data?.slots ?? []).filter(
    (s) => s.available && new Date(s.startsAt).getTime() <= latest,
  );
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
        <div>
          <p className="mb-1.5 text-sm font-medium text-stone-700">{t("meetings.day")}</p>
          <MeetingCalendar
            restaurantId={restaurant.id}
            today={todayLocal(restaurant.timezone)}
            last={booking.serviceDate}
            before={booking.startsAt}
            value={day}
            onChange={(d) => {
              setDay(d);
              setSlot("");
            }}
          />
        </div>
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

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const shiftMonth = (first: string, by: number) => {
  const [y, m] = first.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + by, 1)).toISOString().slice(0, 10);
};

/**
 * Month calendar for the host's meetings: only days with a free slot, from
 * today to the event day, can be tapped; the others are greyed out.
 */
function MeetingCalendar({
  restaurantId,
  today,
  last,
  before,
  value,
  onChange,
}: {
  restaurantId: string;
  today: string;
  /** The event day: the meeting has to come before it. */
  last: string;
  /** The event start: a day only counts the meetings over by then. */
  before: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(monthStart(today));
  const end = addDays(shiftMonth(month, 1), -1);
  const days = useQuery(meetingDaysQuery(restaurantId, month, end, before));
  const free = new Map((days.data?.days ?? []).map((d) => [d.date, d.free]));
  // Monday-first grid: blank cells before the 1st
  const lead = (new Date(`${month}T12:00:00Z`).getUTCDay() + 6) % 7;
  const dates: string[] = [];
  for (let d = month; d <= end; d = addDays(d, 1)) dates.push(d);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2024, 0, 1 + i)),
    ),
  );
  const title = new Intl.DateTimeFormat(i18n.language, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T12:00:00Z`));

  return (
    <div className="rounded-xl border border-stone-200 p-2">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={t("meetings.prevMonth")}
          disabled={month <= monthStart(today)}
          onClick={() => setMonth(shiftMonth(month, -1))}
          className="flex size-12 items-center justify-center rounded-xl hover:bg-stone-100 disabled:opacity-30"
        >
          <ChevronLeft className="size-6" />
        </button>
        <span className="text-[15px] font-semibold capitalize">{title}</span>
        <button
          type="button"
          aria-label={t("meetings.nextMonth")}
          disabled={end >= last}
          onClick={() => setMonth(shiftMonth(month, 1))}
          className="flex size-12 items-center justify-center rounded-xl hover:bg-stone-100 disabled:opacity-30"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w) => (
          <span key={w} className="py-1 text-xs font-semibold uppercase text-stone-500">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${dates[0]}-${i}`} />
        ))}
        {dates.map((d) => {
          const open = d >= today && d <= last && (free.get(d) ?? 0) > 0;
          const selected = d === value;
          return (
            <button
              key={d}
              type="button"
              disabled={!open}
              aria-pressed={selected}
              onClick={() => onChange(d)}
              className={cn(
                "flex h-12 items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums",
                selected
                  ? "bg-brand-600 text-white"
                  : open
                    ? "border border-stone-300 bg-white text-stone-900 hover:border-brand-400"
                    : "cursor-not-allowed bg-stone-100 text-stone-300",
              )}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      {days.isLoading ? (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      ) : null}
    </div>
  );
}
