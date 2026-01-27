import { BOOKING_STATUSES } from "@sitli/core";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { bookingsSearchQuery, restaurantQuery } from "@/lib/queries";
import { formatDate, formatTime, todayLocal } from "@/lib/utils";

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

function BookingsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const filtered = !!(search.q || search.status || search.from || search.to);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("bookings.title")}</h1>
        {data ? (
          <span className="text-sm text-zinc-500">
            {t("bookings.count", { count: data.total })}
          </span>
        ) : null}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-zinc-400" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("bookings.search")}
            aria-label={t("bookings.search")}
            className="pl-9"
          />
        </div>
        <Select
          value={search.status ?? ""}
          onChange={(e) => update({ status: e.target.value, page: 1 })}
          className="w-auto"
          aria-label={t("bookings.columns.status")}
        >
          <option value="">{t("bookings.allStatuses")}</option>
          {BOOKING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`today.status.${s}`)}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          variant={upcoming ? "secondary" : "outline"}
          onClick={() =>
            update(upcoming ? { from: "", to: "", page: 1 } : { from: today, to: "", page: 1 })
          }
        >
          {t("bookings.upcoming")}
        </Button>
        <Button
          size="sm"
          variant={past ? "secondary" : "outline"}
          onClick={() =>
            update(past ? { from: "", to: "", page: 1 } : { from: "", to: today, page: 1 })
          }
        >
          {t("bookings.past")}
        </Button>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps an Input component */}
        <label className="flex items-center gap-1 text-sm text-zinc-500">
          {t("bookings.from")}
          <Input
            type="date"
            value={search.from ?? ""}
            onChange={(e) => update({ from: e.target.value, page: 1 })}
            className="h-8 w-auto"
          />
        </label>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps an Input component */}
        <label className="flex items-center gap-1 text-sm text-zinc-500">
          {t("bookings.to")}
          <Input
            type="date"
            value={search.to ?? ""}
            onChange={(e) => update({ to: e.target.value, page: 1 })}
            className="h-8 w-auto"
          />
        </label>
        {filtered ? (
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
        ) : null}
      </div>

      {bookings.isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState>{t("bookings.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("bookings.columns.when")}</th>
                <th className="px-4 py-2 font-medium">{t("bookings.columns.guest")}</th>
                <th className="px-4 py-2 text-right font-medium">{t("bookings.columns.party")}</th>
                <th className="px-4 py-2 font-medium">{t("bookings.columns.service")}</th>
                <th className="px-4 py-2 font-medium">{t("bookings.columns.status")}</th>
                <th className="px-4 py-2 font-medium">{t("bookings.columns.code")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.items.map((b) => (
                <tr key={b.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Link
                      to="/r/$restaurantId/today"
                      params={{ restaurantId }}
                      search={{ date: b.serviceDate }}
                      title={t("bookings.openDay")}
                      className="hover:text-brand"
                    >
                      <span className="capitalize">
                        {formatDate(b.serviceDate, i18n.language, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>{" "}
                      <span className="font-mono">
                        {formatTime(b.startsAt, restaurant.timezone, i18n.language)}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      to="/r/$restaurantId/customers/$customerId"
                      params={{ restaurantId, customerId: b.customer.id }}
                      className="font-medium hover:text-brand"
                    >
                      {b.customer.name}
                    </Link>
                    {b.customer.phone ? (
                      <span className="ml-2 text-xs text-zinc-500">{b.customer.phone}</span>
                    ) : null}
                    {b.notes ? <p className="text-xs text-zinc-500">{b.notes}</p> : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.partySize}</td>
                  <td className="px-4 py-2 text-zinc-600">{b.serviceName}</td>
                  <td className="px-4 py-2">
                    <Badge tone={b.status}>{t(`today.status.${b.status}`)}</Badge>
                    <span className="ml-2 text-xs text-zinc-400">
                      {t(`today.source.${b.source}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-zinc-500">
                    {b.confirmationCode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-zinc-500">
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
