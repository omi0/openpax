import type { BookingDto, ScheduleExceptionDto } from "@sitli/shared";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarOff, ChevronLeft, ChevronRight, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookingFormDialog } from "@/components/booking-form-dialog";
import { Badge, Button, IconButton } from "@/components/ui";
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
  formatTime,
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
const dot: Record<string, string> = {
  pending: "bg-amber-400",
  confirmed: "bg-emerald-500",
  seated: "bg-sky-500",
  completed: "bg-stone-400",
  cancelled: "bg-red-300",
  no_show: "bg-red-300",
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
    };
  });
  const weekBookings = byDay.reduce((n, d) => n + d.bookings, 0);
  const weekCovers = byDay.reduce((n, d) => n + d.covers, 0);
  const busiest = Math.max(1, ...byDay.map((d) => d.covers));
  const last = days[6] ?? week;
  const sameMonth = week.slice(0, 7) === last.slice(0, 7);
  const label = `${formatDate(week, i18n.language, {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  })} – ${formatDate(last, i18n.language, { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <IconButton
              label={t("calendar.prev")}
              variant="outline"
              size="sm"
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft />
            </IconButton>
            <IconButton
              label={t("calendar.next")}
              variant="outline"
              size="sm"
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight />
            </IconButton>
            {week !== thisWeek ? (
              <Button variant="ghost" size="sm" onClick={() => setWeek(thisWeek)}>
                {t("calendar.thisWeek")}
              </Button>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight capitalize md:text-[28px]">
            {label}
          </h1>
          <p className="mt-1 text-[15px] text-stone-500">
            {t("calendar.weekTotal", { bookings: weekBookings, covers: weekCovers })}
          </p>
        </div>
        <Button size="lg" icon={<Plus />} onClick={() => setOpen(true)}>
          {t("today.newBooking")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-7 md:gap-2">
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
            share={day.covers / busiest}
            exceptions={day.exceptions}
            services={services}
            timezone={restaurant.timezone}
            loading={!!results[days.indexOf(day.date)]?.isLoading}
          />
        ))}
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
  share,
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
  share: number;
  exceptions: ScheduleExceptionDto[];
  services: Array<{ id: string; name: string; sortOrder: number }>;
  timezone: string;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const closedAll = exceptions.find((e) => e.serviceId === null && e.closed);
  const groups = [...services]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      service: s,
      items: items.filter((b) => b.serviceId === s.id),
      exception: exceptions.find((e) => e.serviceId === s.id),
    }))
    .filter((g) => g.items.length > 0 || g.exception);
  // bookings whose service was deleted or deactivated still need a home
  const known = new Set(services.map((s) => s.id));
  const orphans = items.filter((b) => !known.has(b.serviceId));
  const empty = !loading && !closedAll && groups.length === 0 && orphans.length === 0;

  return (
    <section
      className={cn(
        "flex min-h-44 flex-col overflow-hidden rounded-2xl border bg-white shadow-card",
        isToday ? "border-brand-500 ring-2 ring-brand-500/15" : "border-stone-200",
        closedAll && "bg-stone-50",
        isPast && !isToday && "opacity-80",
      )}
    >
      <Link
        to="/r/$restaurantId/today"
        params={{ restaurantId }}
        search={{ date }}
        title={t("calendar.openDay")}
        className={cn(
          "group flex items-center justify-between gap-2 border-b px-3 py-2.5 transition-colors hover:bg-stone-50",
          isToday ? "border-brand-100 bg-brand-50" : "border-stone-100",
        )}
      >
        <span className="flex items-baseline gap-2">
          <span className={cn("text-2xl font-bold tabular-nums", isToday && "text-brand-700")}>
            {formatDate(date, i18n.language, { day: "numeric" })}
          </span>
          <span className="text-[13px] font-medium text-stone-500 uppercase tracking-wide">
            {formatDate(date, i18n.language, { weekday: "short" }).replace(".", "")}
          </span>
        </span>
        <ArrowRight className="size-4 text-stone-300 transition group-hover:text-brand-600" />
      </Link>
      <div className="px-3 pt-2">
        {bookings > 0 ? (
          <>
            <p className="flex items-center gap-1 text-sm font-semibold text-stone-700">
              <Users className="size-3.5 text-stone-400" /> {t("today.covers", { count: covers })}
            </p>
            <p className="text-xs text-stone-500">{t("today.bookings", { count: bookings })}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${Math.max(6, Math.round(share * 100))}%` }}
              />
            </div>
          </>
        ) : null}
      </div>
      <div className="flex-1 space-y-3 px-3 py-2.5 text-sm">
        {closedAll ? (
          <Badge tone="danger" icon={<CalendarOff />}>
            {t("calendar.closed")}
            {closedAll.reason ? ` · ${closedAll.reason}` : ""}
          </Badge>
        ) : null}
        {loading ? <p className="text-xs text-stone-400">{t("app.loading")}</p> : null}
        {groups.map((g) => (
          <div key={g.service.id}>
            <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wide">
              {g.service.name}
              {g.exception ? (
                <Badge size="sm" tone={g.exception.closed ? "danger" : "warning"}>
                  {g.exception.closed ? t("calendar.closed") : t("calendar.customHours")}
                </Badge>
              ) : null}
            </p>
            <BookingRows items={g.items} timezone={timezone} />
          </div>
        ))}
        {orphans.length > 0 ? <BookingRows items={orphans} timezone={timezone} /> : null}
        {empty ? (
          <p className="pt-2 text-center text-[13px] text-stone-300">{t("calendar.noBookings")}</p>
        ) : null}
      </div>
    </section>
  );
}

function BookingRows({ items, timezone }: { items: BookingDto[]; timezone: string }) {
  const { i18n } = useTranslation();
  return (
    <ul className="space-y-1">
      {items.map((b) => {
        const inactive = !ACTIVE.has(b.status);
        return (
          <li
            key={b.id}
            className={cn(
              "flex items-center gap-1.5 rounded-md",
              inactive && "text-stone-400 line-through decoration-stone-300",
            )}
            title={`${b.customer.name} · ${b.partySize} · ${b.status}`}
          >
            <span className={cn("size-2 shrink-0 rounded-full", dot[b.status] ?? "bg-stone-300")} />
            <span className="text-[13px] font-semibold tabular-nums">
              {formatTime(b.startsAt, timezone, i18n.language)}
            </span>
            <span className="min-w-0 flex-1 truncate">{b.customer.name}</span>
            <span className="text-xs font-medium tabular-nums text-stone-500">{b.partySize}</span>
          </li>
        );
      })}
    </ul>
  );
}
