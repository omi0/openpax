import type { BookingAction } from "@sitli/core";
import type { BookingDto, RestaurantDto } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Armchair,
  Ban,
  CalendarDays,
  CalendarX,
  CheckCheck,
  CircleCheck,
  Copy,
  LayoutGrid,
  Mail,
  Pencil,
  Phone,
  Send,
  StickyNote,
  Undo2,
  UserRound,
  Users,
  UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Avatar,
  Badge,
  Button,
  type ButtonVariant,
  Sheet,
  StatusBadge,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api } from "@/lib/api";
import { bookingNotificationsQuery } from "@/lib/queries";
import { cn, formatDate, formatTime } from "@/lib/utils";

export const ACTIVE_STATUSES = new Set(["pending", "confirmed", "seated"]);

/** The one thing staff most likely want to do next, per status. */
export const primaryActionFor: Record<string, BookingAction | null> = {
  pending: "confirm",
  confirmed: "seat",
  seated: "complete",
  completed: null,
  cancelled: "reopen",
  no_show: "reopen",
};

/** Every action allowed from a status, primary first. */
export const actionsFor: Record<string, BookingAction[]> = {
  pending: ["confirm", "cancel"],
  confirmed: ["seat", "no_show", "cancel"],
  seated: ["complete", "cancel"],
  completed: [],
  cancelled: ["reopen"],
  no_show: ["reopen"],
};

export const actionIcons: Record<BookingAction, ReactNode> = {
  confirm: <CircleCheck />,
  seat: <Armchair />,
  complete: <CheckCheck />,
  cancel: <Ban />,
  no_show: <UserX />,
  reopen: <Undo2 />,
};

export const actionVariant: Record<BookingAction, ButtonVariant> = {
  confirm: "primary",
  seat: "primary",
  complete: "secondary",
  cancel: "outline",
  no_show: "outline",
  reopen: "secondary",
};

/** Slide-over with everything about one booking and the actions on it. */
export function BookingSheet({
  restaurant,
  booking,
  hasFloor,
  onClose,
  onAction,
  onEdit,
  onAssign,
  busy,
}: {
  restaurant: RestaurantDto;
  booking: BookingDto | null;
  hasFloor: boolean;
  onClose: () => void;
  onAction: (b: BookingDto, action: BookingAction) => void;
  onEdit: (b: BookingDto) => void;
  onAssign: (b: BookingDto) => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const b = booking;
  const active = b ? ACTIVE_STATUSES.has(b.status) : false;
  return (
    <Sheet
      open={b !== null}
      onClose={onClose}
      title={b?.customer.name ?? ""}
      header={
        b ? (
          <div className="flex items-center gap-3">
            <Avatar name={b.customer.name} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{b.customer.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={b.status} size="sm" />
                <Badge size="sm">{t(`today.source.${b.source}`)}</Badge>
                {b.customer.noShowCount > 0 ? (
                  <Badge tone="danger" size="sm" icon={<UserX />}>
                    {t("today.noShows", { count: b.customer.noShowCount })}
                  </Badge>
                ) : null}
                {b.customer.cancelCount > 0 ? (
                  <Badge tone="warning" size="sm" icon={<CalendarX />}>
                    {t("today.cancellations", { count: b.customer.cancelCount })}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        ) : null
      }
      footer={
        b ? (
          <div className="grid grid-cols-2 gap-2">
            {actionsFor[b.status]?.map((action, i) => (
              <Button
                key={action}
                size="lg"
                variant={actionVariant[action]}
                icon={actionIcons[action]}
                disabled={busy}
                onClick={() => onAction(b, action)}
                className={cn(
                  i === 0 && (actionsFor[b.status]?.length ?? 0) % 2 === 1 && "col-span-2",
                  action === "cancel" && "text-red-700 hover:bg-red-50",
                )}
              >
                {action === "cancel" ? t("today.cancelTitle") : t(`today.actions.${action}`)}
              </Button>
            ))}
          </div>
        ) : null
      }
    >
      {b ? (
        <div className="space-y-5">
          {/* one-tap contact */}
          {b.customer.phone || b.customer.email ? (
            <div className="grid grid-cols-2 gap-2">
              {b.customer.phone ? (
                <a
                  href={`tel:${b.customer.phone.replace(/\s+/g, "")}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
                >
                  <Phone className="size-[18px]" /> {t("today.call")}
                </a>
              ) : null}
              {b.customer.email ? (
                <a
                  href={`mailto:${b.customer.email}`}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-[15px] font-semibold text-stone-800 hover:bg-stone-50"
                >
                  <Mail className="size-[18px]" /> {t("today.emailGuest")}
                </a>
              ) : null}
            </div>
          ) : null}

          {b.notes ? (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[15px] text-amber-950">
              <StickyNote className="mt-0.5 size-[18px] shrink-0 text-amber-600" />
              <p className="whitespace-pre-wrap">{b.notes}</p>
            </div>
          ) : null}

          <dl className="divide-y divide-stone-100 rounded-xl border border-stone-200 px-4">
            <Row icon={<CalendarDays />} label={t("today.form.date")}>
              <span className="capitalize">{formatDate(b.serviceDate, i18n.language)}</span>
              {" · "}
              <span className="tabular-nums">
                {formatTime(b.startsAt, restaurant.timezone, i18n.language)}
              </span>
              <span className="block text-sm font-normal text-stone-500">{b.serviceName}</span>
            </Row>
            <Row icon={<Users />} label={t("today.form.party")}>
              {t("today.guests", { count: b.partySize })}
            </Row>
            {hasFloor ? (
              <Row icon={<LayoutGrid />} label={t("today.table")}>
                {b.tables.length > 0 ? (
                  b.tables.map((x) => x.name).join(" + ")
                ) : (
                  <span className="text-amber-700">{t("today.noTable")}</span>
                )}
                {active ? (
                  <button
                    type="button"
                    onClick={() => onAssign(b)}
                    className="ml-2 text-sm font-medium text-brand-700 hover:underline"
                  >
                    {t("today.changeTable")}
                  </button>
                ) : null}
              </Row>
            ) : null}
            {b.customer.phone ? (
              <Row icon={<Phone />} label={t("today.form.phone")}>
                {b.customer.phone}
              </Row>
            ) : null}
            {b.customer.email ? (
              <Row icon={<Mail />} label={t("today.form.email")}>
                <span className="break-all">{b.customer.email}</span>
              </Row>
            ) : null}
            <Row icon={<Copy />} label={t("today.code")}>
              <span className="font-mono tracking-wider">{b.confirmationCode}</span>
            </Row>
          </dl>

          {b.payment ? <PaymentLine restaurantId={restaurant.id} booking={b} /> : null}

          <div className="flex flex-wrap gap-2">
            {active ? (
              <Button variant="outline" size="sm" icon={<Pencil />} onClick={() => onEdit(b)}>
                {t("today.edit")}
              </Button>
            ) : null}
            <Link
              to="/r/$restaurantId/customers/$customerId"
              params={{ restaurantId: restaurant.id, customerId: b.customer.id }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-800 hover:bg-stone-50"
            >
              <UserRound className="size-4" /> {t("today.viewProfile")}
            </Link>
          </div>

          <NotificationLog
            restaurantId={restaurant.id}
            bookingId={b.id}
            canResend={
              (b.customer.email !== null || b.customer.phone !== null) &&
              b.status !== "completed" &&
              b.status !== "no_show"
            }
          />
        </div>
      ) : null}
    </Sheet>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 text-stone-400 [&_svg]:size-[18px]">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[13px] text-stone-500">{label}</dt>
        <dd className="text-[15px] font-medium text-stone-900">{children}</dd>
      </div>
    </div>
  );
}

function NotificationLog({
  restaurantId,
  bookingId,
  canResend,
}: {
  restaurantId: string;
  bookingId: string;
  canResend: boolean;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const log = useQuery(bookingNotificationsQuery(restaurantId, bookingId));
  // "the email never arrived": send the guest the message for the current status again
  const resend = useMutation({
    mutationFn: () =>
      api.post<{ queued: number }>(
        `/api/v1/restaurants/${restaurantId}/bookings/${bookingId}/notifications/resend`,
      ),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({
        queryKey: ["restaurant", restaurantId, "bookings", bookingId, "notifications"],
      });
      if (r.queued > 0) toast.success(t("today.resent"));
      else toast.error(t("today.resendNothing"));
    },
    onError: () => toast.error(t("app.error")),
  });
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-stone-500 uppercase tracking-wide">
          {t("today.notifications")}
        </p>
        {canResend ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<Send />}
            loading={resend.isPending}
            onClick={() => resend.mutate()}
          >
            {t("today.resend")}
          </Button>
        ) : null}
      </div>
      {log.data?.length ? (
        <ul className="space-y-1.5 text-sm">
          {log.data.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge
                size="sm"
                tone={
                  n.status === "sent" ? "success" : n.status === "failed" ? "danger" : "neutral"
                }
              >
                {n.status}
              </Badge>
              <span className="text-stone-700">
                {n.channel} · {t(`notifications.event.${n.event}`)} ·{" "}
                {t(`notifications.audience.${n.audience}`)}
              </span>
              {n.sentAt ? (
                <span className="text-stone-400">
                  {new Date(n.sentAt).toLocaleTimeString(i18n.language, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-stone-400">{t("today.noNotifications")}</p>
      )}
    </div>
  );
}

/** Deposit / saved card of a booking with the staff actions (refund, charge the no-show fee). */
export function PaymentLine({
  restaurantId,
  booking,
}: {
  restaurantId: string;
  booking: BookingDto;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const p = booking.payment;
  const act = useMutation({
    mutationFn: (what: "refund" | "charge") =>
      api.post(`/api/v1/restaurants/${restaurantId}/bookings/${booking.id}/payment/${what}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] }),
  });
  if (!p) return null;
  const amount = new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: p.currency,
  }).format(p.amountCents / 100);
  const tone =
    p.status === "paid" || p.status === "card_saved" || p.status === "charged"
      ? "success"
      : p.status === "pending"
        ? "warning"
        : p.status === "failed"
          ? "danger"
          : "neutral";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 px-3.5 py-3">
      <Badge tone={tone}>{t(`payments.status.${p.status}`, { amount })}</Badge>
      {p.error ? <span className="text-xs text-red-600">{p.error}</span> : null}
      {p.status === "paid" ? (
        <Button
          size="sm"
          variant="outline"
          loading={act.isPending}
          onClick={async () => {
            if (await confirm({ title: t("payments.confirmRefund", { amount }), tone: "primary" }))
              act.mutate("refund");
          }}
        >
          {t("payments.refund")}
        </Button>
      ) : null}
      {p.status === "card_saved" && booking.status === "no_show" ? (
        <Button
          size="sm"
          variant="outline"
          loading={act.isPending}
          onClick={async () => {
            if (await confirm({ title: t("payments.confirmCharge", { amount }) }))
              act.mutate("charge");
          }}
        >
          {t("payments.charge")}
        </Button>
      ) : null}
      {p.status === "pending" && p.checkoutUrl ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Copy />}
          onClick={() => {
            void navigator.clipboard?.writeText(p.checkoutUrl ?? "");
            toast.success(t("app.copied"));
          }}
        >
          {t("payments.copyLink")}
        </Button>
      ) : null}
    </div>
  );
}
