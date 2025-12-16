import { CUSTOMER_SORTS, type CustomerSort } from "@sitli/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { customersQuery, customerTagsQuery, restaurantQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("customers.title")}</h1>
        {data ? (
          <span className="text-sm text-zinc-500">
            {t("customers.count", { count: data.total })}
          </span>
        ) : null}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-3 left-3 size-4 text-zinc-400" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("customers.search")}
            className="pl-9"
            aria-label={t("customers.search")}
          />
        </div>
        <Select
          value={search.sort ?? "recent"}
          onChange={(e) => update({ sort: e.target.value as CustomerSort, page: 1 })}
          className="w-auto"
          aria-label={t("customers.sort.recent")}
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
            className="w-auto"
            aria-label={t("customers.tags")}
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

      {customers.isLoading ? (
        <Spinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState>{filtered ? t("customers.noResults") : t("customers.empty")}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 font-medium">{t("customers.columns.name")}</th>
                <th className="px-4 py-2 font-medium">{t("customers.columns.contact")}</th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("customers.columns.visits")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("customers.columns.noShows")}
                </th>
                <th className="px-4 py-2 font-medium">{t("customers.columns.lastVisit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.items.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2">
                    <Link
                      to="/r/$restaurantId/customers/$customerId"
                      params={{ restaurantId, customerId: c.id }}
                      className="font-medium text-zinc-900 hover:text-brand"
                    >
                      {c.name}
                    </Link>
                    {c.tags.length > 0 ? (
                      <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                        {c.tags.map((tag) => (
                          <Badge key={tag}>{tag}</Badge>
                        ))}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {c.phone ? <div>{c.phone}</div> : null}
                    {c.email ? <div className="text-xs">{c.email}</div> : null}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.visitCount}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.noShowCount > 0 ? (
                      <span className="text-red-600">{c.noShowCount}</span>
                    ) : (
                      <span className="text-zinc-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-600">
                    {c.lastVisitAt
                      ? formatDateTime(c.lastVisitAt, restaurant.timezone, i18n.language)
                      : t("customers.never")}
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
