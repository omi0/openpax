import type { BookingDto, ScheduleExceptionDto } from "@sitli/shared";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookingFormDialog } from "@/components/booking-form-dialog";
import { Button, IconButton } from "@/components/ui";
import {
  bookingsQuery,
  exceptionsQuery,
  meQuery,
  restaurantQuery,
  servicesQuery,
} from "@/lib/queries";
import {
  addDays,
  cn,
  dateRange,
  formatDate,
  formatDateRange,
  formatTime,
  isoWeek,
  startOfWeek,
  todayLocal,
} from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/calendar")({
  validateSearch: (search: Record<string, unknown>): { week?: string } =>
    typeof search.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.week)
      ? { week: startOfWeek(search.week) }
      : {},
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(servicesQuery(params.restaurantId)),
  component: CalendarPage,
});

const ACTIVE = new Set(["pending", "confirmed", "seated"]);
/* The time carries the status: no room for a badge in a week column. */
const timeTone: Record<string, string> = {
  pending: "text-amber-700",
  confirmed: "text-stone-900",
  seated: "text-sky-700",
  completed: "text-stone-500",
  cancelled: "text-stone-400 line-through",
  no_show: "text-stone-400 line-through",
};

function CalendarPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { week: searchWeek } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: services } = useSuspenseQuery(servicesQuery(restaurantId));
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const today = todayLocal(restaurant.timezone);
  const thisWeek = startOfWeek(today);
  const week = searchWeek ?? thisWeek;
  const days = dateRange(week, 7);
  const exceptions = useQuery(exceptionsQuery(restaurantId));
  const results = useQueries({ queries: days.map((d) => bookingsQuery(restaurantId, d)) });
  const [open, setOpen] = useState(false);

  const setWeek = (w: string) => void navigate({ search: w === thisWeek ? {} : { week: w } });

  const byDay = days.map((date, i) => {
    const items = results[i]?.data?.items ?? [];
    const active = items.filter((b) => ACTIVE.has(b.status));
    return {
      date,
      items,
      bookings: active.length,
      covers: active.reduce((n, b) => n + b.partySize, 0),
      exceptions: (exceptions.data ?? []).filter((e) => e.date === date),
      loading: !!results[i]?.isLoading,
    };
  });
  const weekBookings = byDay.reduce((n, d) => n + d.bookings, 0);
  const weekCovers = byDay.reduce((n, d) => n + d.covers, 0);
  const last = days[6] ?? week;
  const sortedServices = [...services].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight md:text-2xl">
            {formatDateRange(week, last, i18n.language)}
          </h1>
          <p className="mt-0.5 text-sm text-stone-500 tabular-nums">
            {t("calendar.weekNumber", { n: isoWeek(week) })}
            <span aria-hidden="true" className="mx-1.5 text-stone-300">
              ·
            </span>
            {t("calendar.weekTotal", { bookings: weekBookings, covers: weekCovers })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-stone-300 bg-white shadow-xs">
            <IconButton
              label={t("calendar.prev")}
              size="sm"
              className="rounded-r-none"
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft />
            </IconButton>
            <span aria-hidden="true" className="h-5 w-px bg-stone-200" />
            <IconButton
              label={t("calendar.next")}
              size="sm"
              className="rounded-l-none"
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight />
            </IconButton>
          </div>
          {week !== thisWeek ? (
            <Button variant="outline" size="sm" onClick={() => setWeek(thisWeek)}>
              {t("calendar.thisWeek")}
            </Button>
          ) : null}
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t("today.newBooking")}
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-1 divide-y divide-stone-200 md:grid-cols-7 md:divide-x md:divide-y-0">
          {byDay.map((day) => (
            <DayColumn
              key={day.date}
              restaurantId={restaurantId}
              date={day.date}
              isToday={day.date === today}
              isPast={day.date < today}
              items={day.items}
              bookings={day.bookings}
              covers={day.covers}
              exceptions={day.exceptions}
              services={sortedServices}
              timezone={restaurant.timezone}
              loading={day.loading}
            />
          ))}
        </div>
      </div>

      <BookingFormDialog
        restaurant={restaurant}
        date={days.includes(today) ? today : week}
        open={open}
        onClose={() => setOpen(false)}
        canOverride={role !== "staff"}
      />
    </div>
  );
}

function DayColumn({
  restaurantId,
  date,
  isToday,
  isPast,
  items,
  bookings,
  covers,
  exceptions,
  services,
  timezone,
  loading,
}: {
  restaurantId: string;
  date: string;
  isToday: boolean;
  isPast: boolean;
  items: BookingDto[];
  bookings: number;
  covers: number;
  exceptions: ScheduleExceptionDto[];
  services: Array<{ id: string; name: string; sortOrder: number }>;
  timezone: string;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const closedAll = exceptions.find((e) => e.serviceId === null && e.closed);
  const groups = services
    .map((s) => ({
      service: s,
      items: items.filter((b) => b.serviceId === s.id),
      exception: exceptions.find((e) => e.serviceId === s.id),
    }))
    .filter((g) => g.items.length > 0 || g.exception);
  // bookings whose service was deleted or deactivated still need a home
  const known = new Set(services.map((s) => s.id));
  const orphans = items.filter((b) => !known.has(b.serviceId));
  const hasBody = loading || groups.length > 0 || orphans.length > 0;
  const dayNumber = formatDate(date, i18n.language, { day: "numeric" });
  const weekday = formatDate(date, i18n.language, { weekday: "short" }).replace(".", "");

  return (
    <section className={cn("flex min-w-0 flex-col md:min-h-56", closedAll && "bg-stone-50")}>
      <Link
        to="/r/$restaurantId/today"
        params={{ restaurantId }}
        search={{ date }}
        title={t("calendar.openDay")}
        className={cn(
          "flex items-center gap-2 px-3 py-2 transition-colors hover:bg-stone-50 md:h-[5.25rem] md:flex-col md:items-stretch md:gap-1 md:border-b md:border-stone-200",
          isPast && !isToday && "text-stone-500",
        )}
      >
        <span className="flex items-center gap-1.5 md:justify-between">
          <span className="text-[11px] font-semibold tracking-wider uppercase md:order-2">
            {weekday}
          </span>
          <span
            className={cn(
              "inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-[17px] font-semibold tabular-nums",
              isToday && "bg-brand-600 text-white",
            )}
          >
            {dayNumber}
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-stone-500 tabular-nums md:flex-none md:whitespace-normal">
          {closedAll ? (
            <span className="font-medium text-red-700">
              {t("calendar.closed")}
              {closedAll.reason ? ` · ${closedAll.reason}` : ""}
            </span>
          ) : bookings > 0 ? (
            <>
              <span className="md:block">{t("today.covers", { count: covers })}</span>
              <span aria-hidden="true" className="md:hidden">
                {" · "}
              </span>
              <span className="md:block">{t("today.bookings", { count: bookings })}</span>
            </>
          ) : (
            <span className="text-stone-300">{t("calendar.noBookings")}</span>
          )}
        </span>
      </Link>
      {hasBody ? (
        <div className="space-y-2.5 px-3 pt-1 pb-3 md:px-2.5 md:pt-2">
          {loading ? <p className="text-xs text-stone-400">{t("app.loading")}</p> : null}
          {groups.map((g) => (
            <div key={g.service.id}>
              {services.length > 1 || g.exception ? (
                <p className="mb-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
                  {services.length > 1 ? g.service.name : null}
                  {g.exception ? (
                    <span className={g.exception.closed ? "text-red-700" : "text-amber-700"}>
                      {g.exception.closed ? t("calendar.closed") : t("calendar.customHours")}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <BookingRows items={g.items} timezone={timezone} />
            </div>
          ))}
          {orphans.length > 0 ? <BookingRows items={orphans} timezone={timezone} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** "Lucia B." for the narrow week columns; the full name is in the tooltip. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1]?.charAt(0)}.`;
}

function BookingRows({ items, timezone }: { items: BookingDto[]; timezone: string }) {
  const { t, i18n } = useTranslation();
  return (
    <ul>
      {items.map((b) => {
        const inactive = !ACTIVE.has(b.status);
        return (
          <li
            key={b.id}
            className={cn(
              "flex items-center gap-1.5 text-[13px] leading-6",
              inactive && "text-stone-400 line-through decoration-stone-300",
            )}
            title={`${b.customer.name} · ${t("today.guests", { count: b.partySize })} · ${t(`today.status.${b.status}`)}`}
          >
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                timeTone[b.status] ?? "text-stone-700",
              )}
            >
              {formatTime(b.startsAt, timezone, i18n.language)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="md:hidden">{b.customer.name}</span>
              <span className="hidden md:inline">{shortName(b.customer.name)}</span>
            </span>
            <span className="text-xs font-medium text-stone-500 tabular-nums">{b.partySize}</span>
          </li>
        );
      })}
    </ul>
  );
}
