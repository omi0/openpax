import { CUSTOMER_SORTS, type CustomerSort } from "@sitli/shared";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarX, Mail, Phone, Users, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CsvActions } from "@/components/csv-actions";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  PageLoader,
  SearchInput,
  Select,
} from "@/components/ui";
import { customersQuery, customerTagsQuery, restaurantQuery } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";

interface CustomersSearch {
  q?: string;
  tag?: string;
  sort?: CustomerSort;
  page?: number;
}

const isSort = (v: unknown): v is CustomerSort =>
  typeof v === "string" && (CUSTOMER_SORTS as readonly string[]).includes(v);

export const Route = createFileRoute("/_app/r/$restaurantId/customers/")({
  validateSearch: (search: Record<string, unknown>): CustomersSearch => ({
    ...(typeof search.q === "string" && search.q ? { q: search.q } : {}),
    ...(typeof search.tag === "string" && search.tag ? { tag: search.tag } : {}),
    ...(isSort(search.sort) ? { sort: search.sort } : {}),
    ...(typeof search.page === "number" && search.page > 1 ? { page: search.page } : {}),
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [term, setTerm] = useState(search.q ?? "");
  const tags = useQuery(customerTagsQuery(restaurantId));
  const customers = useQuery(
    customersQuery(restaurantId, {
      search: search.q,
      tag: search.tag,
      sort: search.sort ?? "recent",
      page: search.page ?? 1,
    }),
  );

  const update = (patch: CustomersSearch) =>
    void navigate({
      search: (prev) => {
        const next = { ...prev, ...patch };
        if (!next.q) delete next.q;
        if (!next.tag) delete next.tag;
        if (!next.page || next.page <= 1) delete next.page;
        return next;
      },
    });

  // Debounce typing into the URL so back/forward and reloads keep the search.
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((search.q ?? "") !== term.trim()) update({ q: term.trim(), page: 1 });
    }, 300);
    return () => clearTimeout(handle);
  }, [term]);

  const data = customers.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const page = search.page ?? 1;
  const filtered = !!(search.q || search.tag);

  return (
    <div>
      <PageHeader
        title={t("customers.title")}
        description={data ? t("customers.count", { count: data.total }) : t("customers.hint")}
        actions={
          <CsvActions
            kind="customers"
            restaurantId={restaurantId}
            exportQuery={{ search: search.q || undefined, tag: search.tag || undefined }}
            onImported={() =>
              queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "customers"] })
            }
          />
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-card md:flex-row md:items-center md:p-4">
        <SearchInput
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("customers.search")}
          aria-label={t("customers.search")}
          className="min-w-0 flex-1"
        />
        <div className="grid grid-cols-2 gap-3 md:flex">
          <Select
            value={search.sort ?? "recent"}
            onChange={(e) => update({ sort: e.target.value as CustomerSort, page: 1 })}
            aria-label={t("customers.sortLabel")}
            wrapperClassName="md:w-44"
          >
            {CUSTOMER_SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`customers.sort.${s}`)}
              </option>
            ))}
          </Select>
          {tags.data && tags.data.length > 0 ? (
            <Select
              value={search.tag ?? ""}
              onChange={(e) => update({ tag: e.target.value || undefined, page: 1 })}
              aria-label={t("customers.tags")}
              wrapperClassName="md:w-44"
            >
              <option value="">{t("customers.allTags")}</option>
              {tags.data.map((x) => (
                <option key={x.tag} value={x.tag}>
                  {x.tag} ({x.count})
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </div>

      {customers.isLoading ? (
        <PageLoader />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={filtered ? t("customers.noResults") : t("customers.empty")}
        >
          {filtered ? null : t("customers.hint")}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5.5rem_6.5rem_11rem] gap-3 border-b border-stone-100 bg-stone-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-stone-500 md:grid">
            <span>{t("customers.columns.name")}</span>
            <span>{t("customers.columns.contact")}</span>
            <span className="text-right">{t("customers.columns.visits")}</span>
            <span className="text-right">{t("customers.columns.noShows")}</span>
            <span className="text-right">{t("customers.columns.cancellations")}</span>
            <span>{t("customers.columns.lastVisit")}</span>
          </div>
          <ul className="divide-y divide-stone-100">
            {data.items.map((c) => (
              <li
                key={c.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-stone-50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5.5rem_6.5rem_11rem] md:gap-3"
              >
                <Avatar name={c.name} className="row-span-2 md:hidden" />
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.name} className="hidden md:inline-flex" />
                  <div className="min-w-0">
                    <Link
                      to="/r/$restaurantId/customers/$customerId"
                      params={{ restaurantId, customerId: c.id }}
                      className="block truncate text-[15px] font-semibold text-stone-900 hover:text-brand-700"
                    >
                      {c.name}
                    </Link>
                    {c.tags.length > 0 ? (
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {c.tags.map((tag) => (
                          <Badge key={tag} size="sm" tone="brand">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="min-w-0 text-[13px] text-stone-500 md:text-sm">
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1 md:flex">
                      <Phone className="size-3.5" /> {c.phone}
                    </span>
                  ) : null}
                  {c.email ? (
                    <span className="ml-3 inline-flex min-w-0 items-center gap-1 md:ml-0 md:flex">
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </span>
                  ) : null}
                  <span className="ml-3 inline md:hidden">
                    {t("customers.visitsShort", { count: c.visitCount })}
                    {c.noShowCount > 0 ? (
                      <span className="ml-2 text-red-600">
                        {t("today.noShows", { count: c.noShowCount })}
                      </span>
                    ) : null}
                    {c.cancelCount > 0 ? (
                      <span className="ml-2 text-amber-700">
                        {t("today.cancellations", { count: c.cancelCount })}
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="hidden text-right text-[15px] font-semibold tabular-nums md:block">
                  {c.visitCount}
                </span>
                <span
                  className={cn(
                    "hidden items-center justify-end gap-1 text-right text-[15px] font-semibold tabular-nums md:inline-flex",
                    c.noShowCount > 0 ? "text-red-600" : "text-stone-300",
                  )}
                >
                  {c.noShowCount > 0 ? <UserX className="size-3.5" /> : null}
                  {c.noShowCount}
                </span>
                <span
                  className={cn(
                    "hidden items-center justify-end gap-1 text-right text-[15px] font-semibold tabular-nums md:inline-flex",
                    c.cancelCount > 0 ? "text-amber-700" : "text-stone-300",
                  )}
                >
                  {c.cancelCount > 0 ? <CalendarX className="size-3.5" /> : null}
                  {c.cancelCount}
                </span>
                <span className="hidden text-sm text-stone-600 md:block">
                  {c.lastVisitAt
                    ? formatDateTime(c.lastVisitAt, restaurant.timezone, i18n.language)
                    : t("customers.never")}
                </span>
              </li>
            ))}
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
