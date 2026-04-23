import type { BookingDto } from "@openpax/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type { Paginated } from "@/lib/queries";
import { formatDate, formatTime } from "@/lib/utils";

/** Sources nobody at the desk typed in themselves. */
const ONLINE = new Set(["widget", "api", "assistant"]);

/**
 * Polls for bookings created since this screen was opened and announces the
 * online ones with a toast, so whoever is at the desk notices a new booking
 * without refreshing (the restaurant's email arrives too, but not here).
 */
export function NewBookingsWatcher({
  restaurantId,
  timezone,
}: {
  restaurantId: string;
  timezone: string;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const since = useRef(new Date().toISOString());
  const seen = useRef(new Set<string>());
  const recent = useQuery({
    queryKey: ["restaurant", restaurantId, "new-bookings"],
    queryFn: () =>
      api.get<Paginated<BookingDto>>(`/api/v1/restaurants/${restaurantId}/bookings`, {
        createdAfter: since.current,
        pageSize: 20,
        order: "desc",
      }),
    refetchInterval: 30_000,
    staleTime: 0,
  });

  useEffect(() => {
    for (const b of recent.data?.items ?? []) {
      if (seen.current.has(b.id)) continue;
      seen.current.add(b.id);
      if (b.createdAt > since.current) since.current = b.createdAt;
      if (!ONLINE.has(b.source)) continue;
      const when = `${formatDate(b.serviceDate, i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "short",
      })} ${formatTime(b.startsAt, timezone, i18n.language)}`;
      toast.info(
        <Link
          to="/r/$restaurantId/today"
          params={{ restaurantId }}
          search={{ date: b.serviceDate }}
          className="font-medium underline-offset-2 hover:underline"
        >
          {t("app.newOnlineBooking", {
            name: b.customer.name,
            guests: t("today.guests", { count: b.partySize }),
            when,
          })}
        </Link>,
        { duration: 12_000 },
      );
    }
  }, [recent.data, restaurantId, timezone, t, i18n.language, toast]);

  return null;
}
