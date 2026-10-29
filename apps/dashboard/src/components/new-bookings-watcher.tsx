import type { OnlineActivityDto } from "@openpax/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, Phone, StickyNote, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatTime } from "@/lib/utils";

type Activity = OnlineActivityDto["items"][number];

const keyOf = (a: Activity) => `${a.kind}:${a.booking.id}:${a.at}`;
const storageKey = (restaurantId: string) => `openpax:online-seen:${restaurantId}`;

/** Last event someone acknowledged on this device; null when unknown. */
function readSeen(restaurantId: string): string | null {
  try {
    return localStorage.getItem(storageKey(restaurantId));
  } catch {
    return null;
  }
}

function writeSeen(restaurantId: string, at: string) {
  try {
    localStorage.setItem(storageKey(restaurantId), at);
  } catch {
    // private window or blocked storage: the alert still works for this session
  }
}

/**
 * New online bookings and guest cancellations, one popup each, until someone
 * at the desk taps "Seen". Picks up what arrived while the screen was closed
 * (since the last acknowledged one on this device), never older ones.
 */
export function NewBookingsWatcher({
  restaurantId,
  timezone,
}: {
  restaurantId: string;
  timezone: string;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // at most a day back: a screen left closed for a week should not open 50 popups
  const since = useRef(
    [readSeen(restaurantId), new Date(Date.now() - 86_400_000).toISOString()]
      .filter((x): x is string => x !== null)
      .sort()
      .at(-1) ?? new Date().toISOString(),
  );
  const known = useRef(new Set<string>());
  const [queue, setQueue] = useState<Activity[]>([]);
  const activity = useQuery({
    queryKey: ["restaurant", restaurantId, "online-activity"],
    queryFn: () =>
      api.get<OnlineActivityDto>(`/api/v1/restaurants/${restaurantId}/bookings/online-activity`, {
        since: since.current,
      }),
    refetchInterval: 20_000,
    staleTime: 0,
  });

  useEffect(() => {
    const fresh = (activity.data?.items ?? []).filter((a) => !known.current.has(keyOf(a)));
    if (fresh.length === 0) return;
    for (const a of fresh) known.current.add(keyOf(a));
    setQueue((q) => [...q, ...fresh]);
    // Today and the lists show the change straight away
    void queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] });
  }, [activity.data, queryClient, restaurantId]);

  const current = queue[0];
  if (!current) return null;
  const b = current.booking;
  const cancelled = current.kind === "cancelled";
  const seen = () => {
    if (current.at > since.current) since.current = current.at;
    writeSeen(restaurantId, since.current);
    setQueue((q) => q.slice(1));
  };
  const row = "flex items-center gap-2.5 text-[15px] text-stone-800";

  return (
    <Dialog
      open
      onClose={seen}
      size="md"
      title={
        <span className={cn(cancelled && "text-red-700")}>
          {t(cancelled ? "app.onlineAlert.cancelled" : "app.onlineAlert.created")}
        </span>
      }
      description={
        queue.length > 1
          ? t("app.onlineAlert.count", { current: 1, total: queue.length })
          : undefined
      }
      footer={
        <>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              seen();
              void navigate({
                to: "/r/$restaurantId/today",
                params: { restaurantId },
                search: { date: b.serviceDate },
              });
            }}
          >
            {t("app.onlineAlert.openDay")}
          </Button>
          <Button size="lg" onClick={seen}>
            {t("app.onlineAlert.seen")}
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        <p className="text-xl font-semibold text-stone-900">{b.customer.name}</p>
        <p className={row}>
          <CalendarDays className="size-5 shrink-0 text-stone-400" />
          <span className="capitalize">
            {formatDate(b.serviceDate, i18n.language)} ·{" "}
            {formatTime(b.startsAt, timezone, i18n.language)}
          </span>
        </p>
        <p className={row}>
          <Users className="size-5 shrink-0 text-stone-400" />
          {t("today.guests", { count: b.partySize })} · {b.serviceName}
        </p>
        {b.customer.phone ? (
          <p className={row}>
            <Phone className="size-5 shrink-0 text-stone-400" />
            <span className="tabular-nums">{b.customer.phone}</span>
          </p>
        ) : null}
        {b.notes ? (
          <p className="flex items-start gap-2.5 text-[15px] text-amber-900">
            <StickyNote className="mt-0.5 size-5 shrink-0 text-amber-600" />
            {b.notes}
          </p>
        ) : null}
        {cancelled && current.reason ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[15px] text-red-800">
            {t("app.onlineAlert.reason", { reason: current.reason })}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
