import type { FeedbackDto, FeedbackSummaryDto } from "@sitli/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, Card, EmptyState, Select, Spinner } from "@/components/ui";
import { feedbackQuery, feedbackSummaryQuery, restaurantQuery } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";

interface FeedbackSearch {
  rating?: number;
  page?: number;
}

export const Route = createFileRoute("/_app/r/$restaurantId/feedback")({
  validateSearch: (search: Record<string, unknown>): FeedbackSearch => ({
    ...(typeof search.rating === "number" && search.rating >= 1 && search.rating <= 5
      ? { rating: search.rating }
      : {}),
    ...(typeof search.page === "number" && search.page > 1 ? { page: search.page } : {}),
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(feedbackSummaryQuery(params.restaurantId)),
  component: FeedbackPage,
});

export function Stars({ rating, size = "size-4" }: { rating: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= rating ? "fill-amber-400 text-amber-400" : "text-zinc-300")}
        />
      ))}
    </span>
  );
}

function FeedbackPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: summary } = useSuspenseQuery(feedbackSummaryQuery(restaurantId));
  const list = useQuery(feedbackQuery(restaurantId, { rating: search.rating, page: search.page }));
  const items = list.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / (list.data?.pageSize ?? 50)));
  const page = search.page ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t("feedback.title")}</h1>
        <p className="text-sm text-zinc-500">{t("feedback.hint")}</p>
      </div>
      <SummaryCards summary={summary} locale={i18n.language} />

      <Card
        title={t("feedback.responses")}
        actions={
          <Select
            value={search.rating ?? ""}
            onChange={(e) =>
              void navigate({
                search: e.target.value ? { rating: Number(e.target.value) } : {},
              })
            }
            className="h-8 w-auto"
            aria-label={t("feedback.filterRating")}
          >
            <option value="">{t("feedback.anyRating")}</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {t("feedback.stars", { count: n })}
              </option>
            ))}
          </Select>
        }
      >
        {list.isLoading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState>{t("feedback.empty")}</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {items.map((f) => (
              <FeedbackRow
                key={f.id}
                feedback={f}
                restaurantId={restaurantId}
                timezone={restaurant.timezone}
              />
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => void navigate({ search: { ...search, page: page - 1 } })}
            >
              {t("customers.prev")}
            </Button>
            <span className="text-zinc-500">
              {page} / {pages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => void navigate({ search: { ...search, page: page + 1 } })}
            >
              {t("customers.next")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function SummaryCards({ summary, locale }: { summary: FeedbackSummaryDto; locale: string }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...summary.distribution);
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{t("feedback.average")}</p>
        <p className="text-2xl font-semibold tabular-nums">
          {summary.averageRating === null
            ? t("analytics.na")
            : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                summary.averageRating,
              )}
        </p>
        {summary.averageRating !== null ? (
          <Stars rating={Math.round(summary.averageRating)} />
        ) : null}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-zinc-500">{t("feedback.count")}</p>
        <p className="text-2xl font-semibold tabular-nums">{summary.responses}</p>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <ul className="space-y-1">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = summary.distribution[n - 1] ?? 0;
            return (
              <li key={n} className="grid grid-cols-[1.5rem_1fr_2rem] items-center gap-2 text-xs">
                <span className="text-zinc-600">{n}★</span>
                <span className="block h-2 rounded-full bg-zinc-100">
                  <span
                    className="block h-2 rounded-full bg-amber-400"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-zinc-500">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function FeedbackRow({
  feedback: f,
  restaurantId,
  timezone,
}: {
  feedback: FeedbackDto;
  restaurantId: string;
  timezone: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Stars rating={f.rating} />
        <Link
          to="/r/$restaurantId/customers/$customerId"
          params={{ restaurantId, customerId: f.customer.id }}
          className="font-medium hover:text-brand"
        >
          {f.customer.name}
        </Link>
        <span className="text-zinc-500">
          {formatDateTime(f.startsAt, timezone, i18n.language)} · {f.partySize} · {f.serviceName}
        </span>
        <span className="ml-auto text-xs text-zinc-400">
          {t("feedback.answered", { when: formatDateTime(f.createdAt, timezone, i18n.language) })}
        </span>
      </div>
      {f.comment ? (
        <p className="mt-1 whitespace-pre-line text-sm text-zinc-700">{f.comment}</p>
      ) : null}
    </li>
  );
}
