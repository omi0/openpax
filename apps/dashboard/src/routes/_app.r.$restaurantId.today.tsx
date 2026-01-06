import type { BookingAction } from "@sitli/core";
import type { BookingDto } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pencil, Phone, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { BookingFormDialog } from "@/components/booking-form-dialog";
import { Badge, Button, Dialog, EmptyState, Field, Spinner, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { bookingNotificationsQuery, bookingsQuery, meQuery, restaurantQuery } from "@/lib/queries";
import { addDays, formatDate, formatTime, todayLocal } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/today")({
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === "string" ? { date: search.date } : {},
  component: TodayPage,
});

const actionsFor: Record<string, BookingAction[]> = {
  pending: ["confirm", "cancel"],
  confirmed: ["seat", "no_show", "cancel"],
  seated: ["complete", "cancel"],
  completed: [],
  cancelled: ["reopen"],
  no_show: ["reopen"],
};

function TodayPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { date: searchDate } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const today = todayLocal(restaurant.timezone);
  const date = searchDate ?? today;
  const bookings = useQuery(bookingsQuery(restaurantId, date));
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<BookingDto | null>(null);
  const [cancelling, setCancelling] = useState<BookingDto | null>(null);
  const [reason, setReason] = useState("");

  const setDate = (d: string) => void navigate({ search: d === today ? {} : { date: d } });

  const act = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: BookingAction; reason?: string }) =>
      api.post<BookingDto>(`/api/v1/restaurants/${restaurantId}/bookings/${id}/actions`, {
        action,
        ...(reason ? { reason } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] });
      setCancelling(null);
      setReason("");
    },
  });
  const run = (b: BookingDto, action: BookingAction) => {
    if (action === "cancel") setCancelling(b);
    else act.mutate({ id: b.id, action });
  };

  const items = bookings.data?.items ?? [];
  const active = items.filter((b) => ["pending", "confirmed", "seated"].includes(b.status));
  const covers = active.reduce((n, b) => n + b.partySize, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("today.prev")}
            onClick={() => setDate(addDays(date, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 rounded-lg border border-zinc-300 px-2 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            aria-label={t("today.next")}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          {date !== today ? (
            <Button variant="ghost" size="sm" onClick={() => setDate(today)}>
              {t("today.jumpToday")}
            </Button>
          ) : null}
        </div>
        <h1 className="text-xl font-semibold capitalize">{formatDate(date, i18n.language)}</h1>
        <span className="text-sm text-zinc-500">
          {t("today.bookings", { count: active.length })} · {t("today.covers", { count: covers })}
        </span>
        <Button className="ml-auto" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> {t("today.newBooking")}
        </Button>
      </div>

      {bookings.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState>{t("today.noBookings")}</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {items.map((b) => (
            <li key={b.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="w-14 font-mono text-lg font-semibold">
                  {formatTime(b.startsAt, restaurant.timezone, i18n.language)}
                </span>
                <span className="w-8 text-center text-sm">
                  <span className="font-semibold">{b.partySize}</span>
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                >
                  <span className="font-medium">{b.customer.name}</span>
                  <span className="ml-2 text-xs text-zinc-500">{b.serviceName}</span>
                  {b.customer.phone ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                      <Phone className="size-3" /> {b.customer.phone}
                    </span>
                  ) : null}
                  {b.customer.noShowCount > 0 ? (
                    <span className="ml-2 text-xs text-red-600">
                      {b.customer.noShowCount} no-show
                    </span>
                  ) : null}
                </button>
                <Badge tone={b.status}>{t(`today.status.${b.status}`)}</Badge>
                <span className="text-xs text-zinc-400">{t(`today.source.${b.source}`)}</span>
                <div className="flex gap-1">
                  {["pending", "confirmed", "seated"].includes(b.status) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("today.edit")}
                      title={t("today.edit")}
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  ) : null}
                  {actionsFor[b.status]?.map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={
                        action === "cancel" || action === "no_show" ? "outline" : "secondary"
                      }
                      onClick={() => run(b, action)}
                      disabled={act.isPending}
                    >
                      {t(`today.actions.${action}`)}
                    </Button>
                  ))}
                </div>
              </div>
              {b.notes ? <p className="mt-1 pl-[4.5rem] text-sm text-zinc-600">{b.notes}</p> : null}
              {expanded === b.id ? (
                <BookingDetails restaurantId={restaurantId} booking={b} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <BookingFormDialog
        restaurant={restaurant}
        date={date}
        open={open}
        onClose={() => setOpen(false)}
        canOverride={role !== "staff"}
      />
      <Dialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title={t("today.cancelTitle")}
      >
        {cancelling ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">
              {cancelling.customer.name} ·{" "}
              {formatTime(cancelling.startsAt, restaurant.timezone, i18n.language)} ·{" "}
              {cancelling.partySize}
            </p>
            <Field label={t("today.cancelReason")} hint={t("today.cancelReasonHint")}>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelling(null)}>
                {t("today.keep")}
              </Button>
              <Button
                variant="danger"
                loading={act.isPending}
                onClick={() =>
                  act.mutate({ id: cancelling.id, action: "cancel", reason: reason.trim() })
                }
              >
                {t("today.cancelConfirm")}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
      {editing ? (
        <BookingEditDialog
          key={editing.id}
          restaurant={restaurant}
          booking={editing}
          open
          onClose={() => setEditing(null)}
          canOverride={role !== "staff"}
        />
      ) : null}
    </div>
  );
}

function BookingDetails({ restaurantId, booking }: { restaurantId: string; booking: BookingDto }) {
  const { t, i18n } = useTranslation();
  const log = useQuery(bookingNotificationsQuery(restaurantId, booking.id));
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-2">
      <div>
        <p>
          <span className="text-zinc-500">{t("today.code")}:</span>{" "}
          <span className="font-mono">{booking.confirmationCode}</span>
        </p>
        {booking.customer.email ? <p className="text-zinc-600">{booking.customer.email}</p> : null}
        <Link
          to="/r/$restaurantId/customers/$customerId"
          params={{ restaurantId, customerId: booking.customer.id }}
          className="mt-1 inline-block text-brand hover:underline"
        >
          {t("today.viewProfile")}
        </Link>
      </div>
      <div>
        <p className="mb-1 text-zinc-500">{t("today.notifications")}</p>
        {log.data?.length ? (
          <ul className="space-y-0.5">
            {log.data.map((n) => (
              <li key={n.id} className="flex gap-2">
                <Badge
                  tone={
                    n.status === "sent"
                      ? "confirmed"
                      : n.status === "failed"
                        ? "cancelled"
                        : "neutral"
                  }
                >
                  {n.status}
                </Badge>
                <span>
                  {n.channel} · {t(`notifications.event.${n.event}`)} ·{" "}
                  {t(`notifications.audience.${n.audience}`)}
                </span>
                {n.sentAt ? (
                  <span className="text-zinc-400">
                    {new Date(n.sentAt).toLocaleTimeString(i18n.language)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-400">{t("today.noNotifications")}</p>
        )}
      </div>
    </div>
  );
}
