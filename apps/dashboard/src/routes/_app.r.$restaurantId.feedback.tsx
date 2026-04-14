import type { FeedbackDto, FeedbackSummaryDto } from "@openpax/shared";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageSquareHeart, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  PageHeader,
  PageLoader,
  Select,
  Stat,
} from "@/components/ui";
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
    <span className="inline-flex gap-0.5" role="img" aria-label={`${rating}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(size, n <= rating ? "fill-amber-400 text-amber-400" : "text-stone-300")}
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
    <div>
      <PageHeader title={t("feedback.title")} description={t("feedback.hint")} />
      <SummaryCards summary={summary} locale={i18n.language} />

      <Card
        title={t("feedback.responses")}
        className="mt-4"
        flush
        actions={
          <Select
            value={search.rating ?? ""}
            onChange={(e) =>
              void navigate({
                search: e.target.value ? { rating: Number(e.target.value) } : {},
              })
            }
            wrapperClassName="w-44"
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
          <PageLoader />
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<MessageSquareHeart />} title={t("feedback.emptyTitle")}>
              {t("feedback.empty")}
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
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
          <div className="flex items-center justify-end gap-2 border-t border-stone-100 px-5 py-3 text-sm">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => void navigate({ search: { ...search, page: page - 1 } })}
            >
              {t("customers.prev")}
            </Button>
            <span className="text-stone-500">
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
      <Stat
        label={t("feedback.average")}
        icon={<Star />}
        tone="warn"
        value={
          summary.averageRating === null
            ? t("analytics.na")
            : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                summary.averageRating,
              )
        }
        hint={
          summary.averageRating !== null ? (
            <Stars rating={Math.round(summary.averageRating)} />
          ) : undefined
        }
      />
      <Stat
        label={t("feedback.count")}
        icon={<MessageSquareHeart />}
        tone="brand"
        value={summary.responses}
      />
      <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-card">
        <ul className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = summary.distribution[n - 1] ?? 0;
            return (
              <li key={n} className="grid grid-cols-[2rem_1fr_2rem] items-center gap-2 text-[13px]">
                <span className="inline-flex items-center gap-0.5 text-stone-600">
                  {n}
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                </span>
                <span className="block h-2.5 overflow-hidden rounded-r bg-amber-50">
                  <span
                    className="block h-2.5 rounded-r bg-amber-400"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span className="text-right tabular-nums text-stone-500">{count}</span>
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
    <li className="flex gap-3 px-5 py-4">
      <Avatar name={f.customer.name} className="hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            to="/r/$restaurantId/customers/$customerId"
            params={{ restaurantId, customerId: f.customer.id }}
            className="text-[15px] font-semibold hover:text-brand-700"
          >
            {f.customer.name}
          </Link>
          <Stars rating={f.rating} />
          <span className="text-[13px] text-stone-400 sm:ml-auto">
            {t("feedback.answered", {
              when: formatDateTime(f.createdAt, timezone, i18n.language),
            })}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] text-stone-500">
          {formatDateTime(f.startsAt, timezone, i18n.language)} ·{" "}
          {t("today.guests", { count: f.partySize })} · {f.serviceName}
        </p>
        {f.comment ? (
          <p className="mt-2 whitespace-pre-line rounded-xl bg-stone-50 px-3.5 py-2.5 text-[15px] leading-relaxed text-stone-800">
            {f.comment}
          </p>
        ) : null}
      </div>
    </li>
  );
}
