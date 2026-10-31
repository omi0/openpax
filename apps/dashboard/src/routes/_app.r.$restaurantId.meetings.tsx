import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChefHat, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, EmptyState, PageHeader, PageLoader } from "@/components/ui";
import { meetingsQuery, policyQuery, restaurantQuery } from "@/lib/queries";
import { addDays, formatDateTime, todayLocal } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/meetings")({
  component: MeetingsPage,
});

/** Upcoming meetings between the host (chef) and group bookings, next 60 days. */
function MeetingsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const policy = useQuery(policyQuery(restaurantId));
  const from = todayLocal(restaurant.timezone);
  const list = useQuery(meetingsQuery(restaurantId, from, addDays(from, 60)));
  const host = policy.data?.meetingHostName || t("meetings.hostFallback");
  const items = list.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={t("meetings.title", { host })} description={t("meetings.pageHint")} />
      <Card flush={items.length > 0}>
        {list.isLoading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState icon={<ChefHat />} title={t("meetings.empty")}>
            {policy.data?.meetingMinPartySize == null
              ? t("meetings.off")
              : t("meetings.emptyHint", { count: policy.data.meetingMinPartySize })}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                <span className="w-44 text-[15px] font-bold capitalize tabular-nums">
                  {formatDateTime(m.startsAt, restaurant.timezone, i18n.language)}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-[15px] font-semibold">{m.customerName}</p>
                  <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-stone-500">
                    {m.customerPhone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" /> {m.customerPhone}
                      </span>
                    ) : null}
                    <span>
                      {t("meetings.forEvent", {
                        count: m.partySize,
                        when: formatDateTime(m.bookingStartsAt, restaurant.timezone, i18n.language),
                      })}
                    </span>
                  </p>
                </div>
                <Link
                  to="/r/$restaurantId/bookings"
                  params={{ restaurantId }}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  {t("meetings.openBookings")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
