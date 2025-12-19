import type { BookingDto, ScheduleExceptionDto } from "@sitli/shared";
import { useQueries, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookingFormDialog } from "@/components/booking-form-dialog";
import { Badge, Button } from "@/components/ui";
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
  seated: "bg-blue-500",
  completed: "bg-zinc-400",
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
  const last = days[6] ?? week;
  const sameMonth = week.slice(0, 7) === last.slice(0, 7);
  const label = `${formatDate(week, i18n.language, {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  })} – ${formatDate(last, i18n.language, { day: "numeric", month: "long", year: "numeric" })}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("calendar.prev")}
            onClick={() => setWeek(addDays(week, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("calendar.next")}
            onClick={() => setWeek(addDays(week, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {week !== thisWeek ? (
            <Button variant="ghost" size="sm" onClick={() => setWeek(thisWeek)}>
              {t("calendar.thisWeek")}
            </Button>
          ) : null}
        </div>
        <h1 className="text-xl font-semibold">{label}</h1>
        <span className="text-sm text-zinc-500">
          {t("calendar.weekTotal", { bookings: weekBookings, covers: weekCovers })}
        </span>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> {t("today.newBooking")}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-7">
        {byDay.map((day) => (
          <DayColumn
            key={day.date}
            restaurantId={restaurantId}
            date={day.date}
            isToday={day.date === today}
            items={day.items}
            bookings={day.bookings}
            covers={day.covers}
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
  items: BookingDto[];
  bookings: number;
  covers: number;
  exceptions: ScheduleExceptionDto[];
  services: Array<{ id: string; name: string; sortOrder: number }>;
  timezone: string;
  loading: boolean;
}) {
  const { t, i18n } = useTranslation();
  const closedAll = exceptions.some((e) => e.serviceId === null && e.closed);
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

  return (
    <section
      className={cn(
        "flex min-h-40 flex-col rounded-xl border bg-white",
        isToday ? "border-brand" : "border-zinc-200",
        closedAll && "bg-zinc-50",
      )}
    >
      <Link
        to="/r/$restaurantId/today"
        params={{ restaurantId }}
        search={{ date }}
        title={t("calendar.openDay")}
        className={cn(
          "rounded-t-xl border-b px-3 py-2 hover:bg-zinc-50",
          isToday ? "border-brand/30 bg-brand-50" : "border-zinc-100",
        )}
      >
        <p className="text-xs uppercase tracking-wide text-zinc-500">
          {formatDate(date, i18n.language, { weekday: "short" })}
        </p>
        <p className="flex items-baseline gap-2">
          <span className={cn("text-lg font-semibold", isToday && "text-brand")}>
            {formatDate(date, i18n.language, { day: "numeric" })}
          </span>
          {bookings > 0 ? (
            <span className="text-xs text-zinc-500">
              {bookings} · {covers}
            </span>
          ) : null}
        </p>
      </Link>
      <div className="flex-1 space-y-2 px-2 py-2 text-sm">
        {closedAll ? (
          <Badge tone="cancelled">
            {t("calendar.closed")}
            {exceptions.find((e) => e.serviceId === null)?.reason
              ? ` · ${exceptions.find((e) => e.serviceId === null)?.reason}`
              : ""}
          </Badge>
        ) : null}
        {loading ? <p className="text-xs text-zinc-400">{t("app.loading")}</p> : null}
        {groups.map((g) => (
          <div key={g.service.id}>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              {g.service.name}
              {g.exception ? (
                <Badge tone={g.exception.closed ? "cancelled" : "pending"}>
                  {g.exception.closed ? t("calendar.closed") : t("calendar.customHours")}
                </Badge>
              ) : null}
            </p>
            <BookingRows items={g.items} timezone={timezone} />
          </div>
        ))}
        {orphans.length > 0 ? <BookingRows items={orphans} timezone={timezone} /> : null}
        {!loading && !closedAll && groups.length === 0 && orphans.length === 0 ? (
          <p className="text-center text-zinc-300">{t("calendar.noBookings")}</p>
        ) : null}
      </div>
    </section>
  );
}

function BookingRows({ items, timezone }: { items: BookingDto[]; timezone: string }) {
  const { i18n } = useTranslation();
  return (
    <ul className="space-y-0.5">
      {items.map((b) => {
        const inactive = !ACTIVE.has(b.status);
        return (
          <li
            key={b.id}
            className={cn("flex items-center gap-1.5", inactive && "text-zinc-400 line-through")}
            title={`${b.customer.name} · ${b.partySize} · ${b.status}`}
          >
            <span
              className={cn("size-1.5 shrink-0 rounded-full", dot[b.status] ?? "bg-zinc-300")}
            />
            <span className="font-mono text-xs">
              {formatTime(b.startsAt, timezone, i18n.language)}
            </span>
            <span className="min-w-0 flex-1 truncate">{b.customer.name}</span>
            <span className="text-xs tabular-nums text-zinc-500">{b.partySize}</span>
          </li>
        );
      })}
    </ul>
  );
}
