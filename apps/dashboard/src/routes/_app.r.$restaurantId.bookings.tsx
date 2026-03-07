import { BOOKING_STATUSES } from "@sitli/core";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, Phone, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CsvActions } from "@/components/csv-actions";
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageLoader,
  SearchInput,
  Segmented,
  Select,
  StatusBadge,
} from "@/components/ui";
import { bookingsSearchQuery, restaurantQuery } from "@/lib/queries";
import { cn, formatDate, formatTime, todayLocal } from "@/lib/utils";

interface BookingsSearch {
  q?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const Route = createFileRoute("/_app/r/$restaurantId/bookings")({
  validateSearch: (search: Record<string, unknown>): BookingsSearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.status === "string" &&
    (BOOKING_STATUSES as readonly string[]).includes(search.status)
      ? { status: search.status }
      : {}),
    ...(isDate(search.from) ? { from: search.from } : {}),
    ...(isDate(search.to) ? { to: search.to } : {}),
    ...(typeof search.page === "number" && search.page > 1 ? { page: search.page } : {}),
  }),
  component: BookingsPage,
});

const ACTIVE = new Set(["pending", "confirmed", "seated"]);

function BookingsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const today = todayLocal(restaurant.timezone);
  const [term, setTerm] = useState(search.q ?? "");
  const bookings = useQuery(
    bookingsSearchQuery(restaurantId, {
      search: search.q,
      status: search.status,
      from: search.from,
      to: search.to,
      page: search.page ?? 1,
    }),
  );

  const update = (patch: BookingsSearch) =>
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        for (const k of ["q", "status", "from", "to"] as const) if (!next[k]) delete next[k];
        if (!next.page || next.page <= 1) delete next.page;
        return next;
      },
    });

  useEffect(() => {
    const handle = setTimeout(() => {
      if ((search.q ?? "") !== term.trim()) update({ q: term.trim(), page: 1 });
    }, 300);
    return () => clearTimeout(handle);
  }, [term]);

  const data = bookings.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = search.page ?? 1;
  const upcoming = search.from === today && !search.to;
  const past = search.to === today && !search.from;
  const period: "all" | "upcoming" | "past" = upcoming ? "upcoming" : past ? "past" : "all";
  const filtered = !!(search.q || search.status || search.from || search.to);

  return (
    <div>
      <PageHeader
        title={t("bookings.title")}
        description={data ? t("bookings.count", { count: data.total }) : t("bookings.hint")}
        actions={
          <CsvActions
            kind="bookings"
            restaurantId={restaurantId}
            exportQuery={{
              search: search.q || undefined,
              status: search.status || undefined,
              from: search.from || undefined,
              to: search.to || undefined,
            }}
            onImported={() =>
              queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] })
            }
          />
        }
      />

      <div className="mb-4 rounded-2xl border border-stone-200 bg-white p-3 shadow-card md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("bookings.search")}
            aria-label={t("bookings.search")}
            className="min-w-0 flex-1"
          />
          <Segmented
            ariaLabel={t("bookings.period")}
            value={period}
            onChange={(v) =>
              update(
                v === "upcoming"
                  ? { from: today, to: "", page: 1 }
                  : v === "past"
                    ? { from: "", to: today, page: 1 }
                    : { from: "", to: "", page: 1 },
              )
            }
            options={[
              { value: "all", label: t("bookings.all") },
              { value: "upcoming", label: t("bookings.upcoming") },
              { value: "past", label: t("bookings.past") },
            ]}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select
            value={search.status ?? ""}
            onChange={(e) => update({ status: e.target.value, page: 1 })}
            aria-label={t("bookings.columns.status")}
          >
            <option value="">{t("bookings.allStatuses")}</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`today.status.${s}`)}
              </option>
            ))}
          </Select>
          <Field label={t("bookings.from")} className="[&>span]:sr-only">
            <Input
              type="date"
              value={search.from ?? ""}
              onChange={(e) => update({ from: e.target.value, page: 1 })}
              aria-label={t("bookings.from")}
            />
          </Field>
          <Field label={t("bookings.to")} className="[&>span]:sr-only">
            <Input
              type="date"
              value={search.to ?? ""}
              onChange={(e) => update({ to: e.target.value, page: 1 })}
              aria-label={t("bookings.to")}
            />
          </Field>
        </div>
        {filtered ? (
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTerm("");
                update({ q: "", status: "", from: "", to: "", page: 1 });
              }}
            >
              {t("bookings.clear")}
            </Button>
          </div>
        ) : null}
      </div>

      {bookings.isLoading ? (
        <PageLoader />
      ) : !data || data.items.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title={t("bookings.empty")}>
          {filtered ? t("bookings.emptyFiltered") : t("bookings.hint")}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
          <div className="hidden grid-cols-[10rem_minmax(0,1fr)_4.5rem_7rem_10rem_5.5rem_3rem] gap-3 border-b border-stone-100 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">
            <span>{t("bookings.columns.when")}</span>
            <span>{t("bookings.columns.guest")}</span>
            <span className="text-right">{t("bookings.columns.party")}</span>
            <span>{t("bookings.columns.service")}</span>
            <span>{t("bookings.columns.status")}</span>
            <span>{t("bookings.columns.code")}</span>
            <span />
          </div>
          <ul className="divide-y divide-stone-100">
            {data.items.map((b) => {
              const inactive = !ACTIVE.has(b.status);
              return (
                <li
                  key={b.id}
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-stone-50 md:grid-cols-[10rem_minmax(0,1fr)_4.5rem_7rem_10rem_5.5rem_3rem] md:items-center md:gap-3",
                    inactive && "bg-stone-50/50",
                  )}
                >
                  <div className="order-1 flex flex-wrap items-baseline gap-x-2 md:order-none md:block">
                    <span className="text-[15px] font-bold tabular-nums text-stone-900">
                      {formatTime(b.startsAt, restaurant.timezone, i18n.language)}
                    </span>
                    <span className="text-[15px] font-semibold capitalize md:block md:text-sm md:font-medium">
                      {formatDate(b.serviceDate, i18n.language, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="hidden text-[13px] text-stone-500 md:block">
                      {formatDate(b.serviceDate, i18n.language, { year: "numeric" })}
                    </span>
                  </div>
                  <div className="order-3 col-span-2 flex min-w-0 items-center gap-3 md:order-none md:col-span-1">
                    <Avatar
                      name={b.customer.name}
                      size="sm"
                      className={cn(inactive && "opacity-50")}
                    />
                    <div className="min-w-0">
                      <Link
                        to="/r/$restaurantId/customers/$customerId"
                        params={{ restaurantId, customerId: b.customer.id }}
                        className={cn(
                          "block truncate text-[15px] font-semibold hover:text-brand-700",
                          inactive && "text-stone-500",
                        )}
                      >
                        {b.customer.name}
                      </Link>
                      <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-stone-500">
                        {b.customer.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" /> {b.customer.phone}
                          </span>
                        ) : null}
                        <span className="md:hidden">
                          {t("today.guests", { count: b.partySize })} · {b.serviceName}
                        </span>
                        <span className="text-stone-400">{t(`today.source.${b.source}`)}</span>
                      </p>
                      {b.notes ? (
                        <p className="mt-0.5 flex items-start gap-1 text-[13px] text-amber-900">
                          <StickyNote className="mt-0.5 size-3 shrink-0 text-amber-600" />
                          <span className="truncate">{b.notes}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <span className="hidden text-right text-[15px] font-semibold tabular-nums md:block">
                    {b.partySize}
                  </span>
                  <span className="hidden truncate text-[15px] text-stone-600 md:block">
                    {b.serviceName}
                  </span>
                  <div className="order-2 justify-self-end md:order-none md:justify-self-start">
                    <StatusBadge status={b.status} size="sm" />
                  </div>
                  <span className="hidden font-mono text-[13px] tracking-wider text-stone-500 md:block">
                    {b.confirmationCode}
                  </span>
                  <Link
                    to="/r/$restaurantId/today"
                    params={{ restaurantId }}
                    search={{ date: b.serviceDate }}
                    title={t("bookings.openDay")}
                    aria-label={t("bookings.openDay")}
                    className="order-4 col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-stone-200 text-sm font-medium text-stone-700 hover:bg-stone-100 md:order-none md:col-span-1 md:size-9 md:border-0 md:text-stone-400 md:hover:text-brand-700"
                  >
                    <CalendarDays className="size-4" />
                    <span className="md:hidden">{t("bookings.openDay")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-stone-500">
          <span>{t("customers.page", { page, pages })}</span>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => update({ page: page - 1 })}
          >
            {t("customers.prev")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => update({ page: page + 1 })}
          >
            {t("customers.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
