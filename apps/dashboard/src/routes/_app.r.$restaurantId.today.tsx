import type { BookingAction } from "@openpax/core";
import type {
  AreaDto,
  BookingDto,
  ScheduleExceptionDto,
  UpsertAreaInput,
  UpsertScheduleExceptionInput,
} from "@openpax/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Armchair,
  CalendarDays,
  CalendarOff,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  EllipsisVertical,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Printer,
  StickyNote,
  UserX,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { BookingFormDialog } from "@/components/booking-form-dialog";
import {
  ACTIVE_STATUSES,
  actionIcons,
  actionsFor,
  BookingSheet,
  primaryActionFor,
} from "@/components/booking-sheet";
import { FloorPlan, type TableStatus } from "@/components/floor-plan";
import { defaultExceptionInput, ExceptionForm } from "@/components/schedule-forms";
import { SetupProgressCard } from "@/components/setup-card";
import { TableAssignDialog } from "@/components/table-assign-dialog";
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Menu,
  type MenuItem,
  PageLoader,
  Segmented,
  StatusMark,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { api } from "@/lib/api";
import {
  areasQuery,
  bookingsQuery,
  exceptionsQuery,
  meQuery,
  restaurantQuery,
  servicesQuery,
  tablesQuery,
} from "@/lib/queries";
import {
  addDays,
  cn,
  coversDate,
  dateRange,
  formatDate,
  formatTime,
  startOfWeek,
  todayLocal,
} from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/today")({
  validateSearch: (search: Record<string, unknown>): { date?: string } =>
    typeof search.date === "string" ? { date: search.date } : {},
  component: TodayPage,
});

function TodayPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { date: searchDate } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const today = todayLocal(restaurant.timezone);
  const date = searchDate ?? today;
  const bookings = useQuery(bookingsQuery(restaurantId, date));
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<BookingDto | null>(null);
  const [cancelling, setCancelling] = useState<BookingDto | null>(null);
  const [reason, setReason] = useState("");
  const [assigning, setAssigning] = useState<BookingDto | null>(null);
  const [view, setView] = useState<"list" | "floor">("list");
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const tables = useQuery(tablesQuery(restaurantId));
  const areas = useQuery(areasQuery(restaurantId));
  const exceptions = useQuery(exceptionsQuery(restaurantId));
  const hasFloor = (tables.data?.length ?? 0) > 0;
  const rooms = areas.data ?? [];
  const closedRooms = rooms.filter((r) => !r.active);
  // closures and special hours that touch this day (the one that starts last wins, like the engine)
  const dayExceptions = (exceptions.data ?? [])
    .filter((e) => coversDate(e, date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const closedAll = dayExceptions.find((e) => e.serviceId === null && e.closed) ?? null;
  const closedDays = new Set(
    dateRange(startOfWeek(date), 7).filter((d) =>
      (exceptions.data ?? []).some((e) => e.serviceId === null && e.closed && coversDate(e, d)),
    ),
  );

  const setDate = (d: string) => void navigate({ search: d === today ? {} : { date: d } });

  const act = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: BookingAction; reason?: string }) =>
      api.post<BookingDto>(`/api/v1/restaurants/${restaurantId}/bookings/${id}/actions`, {
        action,
        ...(reason ? { reason } : {}),
      }),
    onSuccess: async (_b, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] });
      setCancelling(null);
      setReason("");
      toast.success(t(`today.done.${vars.action}`));
    },
    onError: () => toast.error(t("app.error")),
  });
  const run = (b: BookingDto, action: BookingAction) => {
    if (action === "cancel") setCancelling(b);
    else act.mutate({ id: b.id, action });
  };

  const items = bookings.data?.items ?? [];
  const selectedBooking = items.find((b) => b.id === selected) ?? null;
  const active = items.filter((b) => ACTIVE_STATUSES.has(b.status));
  const covers = active.reduce((n, b) => n + b.partySize, 0);
  const seatedNow = items.filter((b) => b.status === "seated").length;
  const pending = items.filter((b) => b.status === "pending").length;

  // group by service, in order of first arrival
  const groups: Array<{ id: string; name: string; items: BookingDto[] }> = [];
  for (const b of items) {
    let g = groups.find((x) => x.id === b.serviceId);
    if (!g) {
      g = { id: b.serviceId, name: b.serviceName, items: [] };
      groups.push(g);
    }
    g.items.push(b);
  }
  const longDate = formatDate(date, i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight capitalize md:text-2xl">
            {date === today ? t("today.title") : longDate}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-stone-500 tabular-nums">
            {date === today ? <span className="capitalize">{longDate}</span> : null}
            {date === today ? <Sep /> : null}
            <span>{t("today.bookings", { count: active.length })}</span>
            <Sep />
            <span>{t("today.covers", { count: covers })}</span>
            {seatedNow > 0 ? (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 font-medium text-sky-800">
                  <Armchair className="size-3.5" />
                  {t("today.seatedNow", { count: seatedNow })}
                </span>
              </>
            ) : null}
            {pending > 0 ? (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                  <Clock className="size-3.5" />
                  {t("today.toConfirm", { count: pending })}
                </span>
              </>
            ) : null}
            {closedRooms.map((r) => (
              <span key={r.id} className="contents">
                <Sep />
                <span className="inline-flex items-center gap-1 font-medium text-amber-800">
                  <DoorOpen className="size-3.5" />
                  {t("today.roomClosed", { name: r.name })}
                </span>
              </span>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <IconButton label={t("today.print")} size="sm" onClick={() => window.print()}>
            <Printer />
          </IconButton>
          {role !== "staff" && !closedAll ? (
            <IconButton label={t("today.closeDay")} size="sm" onClick={() => setClosing(true)}>
              <CalendarOff />
            </IconButton>
          ) : null}
          {rooms.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              icon={<DoorOpen />}
              onClick={() => setRoomsOpen(true)}
            >
              {t("today.rooms")}
            </Button>
          ) : null}
          {hasFloor ? (
            <Segmented
              size="sm"
              ariaLabel={t("today.viewLabel")}
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: t("today.listView"), icon: <List /> },
                { value: "floor", label: t("today.floorView"), icon: <LayoutGrid /> },
              ]}
            />
          ) : null}
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            {t("today.newBooking")}
          </Button>
        </div>
      </div>

      <DayStrip date={date} today={today} closedDays={closedDays} onChange={setDate} />

      <div className="mt-4 print:hidden">
        <SetupProgressCard restaurantId={restaurantId} role={role} variant="today" />
      </div>

      {dayExceptions.length > 0 ? (
        <ClosureNotice
          restaurantId={restaurantId}
          exceptions={dayExceptions}
          closedAll={closedAll}
        />
      ) : null}

      {view === "floor" && tables.data ? (
        <FloorView
          tables={tables.data}
          areas={areas.data ?? []}
          bookings={items}
          timezone={restaurant.timezone}
          date={date}
          today={today}
          onPick={(b) => setAssigning(b)}
        />
      ) : bookings.isLoading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 bg-white">
          <EmptyState
            icon={<CalendarDays />}
            title={t("today.noBookings")}
            action={
              <Button variant="outline" icon={<Plus />} onClick={() => setOpen(true)}>
                {t("today.newBooking")}
              </Button>
            }
          >
            {t("today.noBookingsHint")}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          <div
            aria-hidden="true"
            className={cn(
              "hidden gap-x-3 border-b border-stone-200 px-4 py-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase md:grid",
              hasFloor ? ROW_COLS_FLOOR : ROW_COLS,
            )}
          >
            <span>{t("today.time")}</span>
            <span>{t("today.guest")}</span>
            <span>{t("today.party")}</span>
            {hasFloor ? <span>{t("today.table")}</span> : null}
            <span>{t("bookings.columns.status")}</span>
            <span />
          </div>
          {groups.map((g) => {
            const gActive = g.items.filter((b) => ACTIVE_STATUSES.has(b.status));
            return (
              <section key={g.id}>
                {groups.length > 1 ? (
                  <h2 className="flex items-baseline justify-between gap-3 border-y border-stone-200 bg-stone-50 px-4 py-1.5 first:border-t-0">
                    <span className="text-[13px] font-semibold text-stone-800">{g.name}</span>
                    <span className="text-xs text-stone-500 tabular-nums">
                      {t("today.bookings", { count: gActive.length })} ·{" "}
                      {t("today.covers", {
                        count: gActive.reduce((n, b) => n + b.partySize, 0),
                      })}
                    </span>
                  </h2>
                ) : null}
                <ul className="divide-y divide-stone-100">
                  {g.items.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      timezone={restaurant.timezone}
                      hasFloor={hasFloor}
                      busy={act.isPending}
                      onOpen={() => setSelected(b.id)}
                      onAction={(a) => run(b, a)}
                      onEdit={() => setEditing(b)}
                      onAssign={() => setAssigning(b)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <div className="print:hidden">
        <WaitlistPanel restaurant={restaurant} date={date} canOverride={role !== "staff"} />
      </div>

      <BookingSheet
        restaurant={restaurant}
        booking={selectedBooking}
        hasFloor={hasFloor}
        busy={act.isPending}
        onClose={() => setSelected(null)}
        onAction={run}
        onEdit={(b) => setEditing(b)}
        onAssign={(b) => setAssigning(b)}
      />

      <RoomsDialog
        restaurantId={restaurantId}
        rooms={rooms}
        open={roomsOpen}
        onClose={() => setRoomsOpen(false)}
      />
      {closing ? (
        <CloseDayDialog restaurantId={restaurantId} date={date} onClose={() => setClosing(false)} />
      ) : null}
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
        description={
          cancelling
            ? `${cancelling.customer.name} · ${formatTime(cancelling.startsAt, restaurant.timezone, i18n.language)} · ${t("today.guests", { count: cancelling.partySize })}`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              {t("today.keep")}
            </Button>
            <Button
              variant="danger"
              loading={act.isPending}
              onClick={() =>
                cancelling &&
                act.mutate({ id: cancelling.id, action: "cancel", reason: reason.trim() })
              }
            >
              {t("today.cancelConfirm")}
            </Button>
          </>
        }
      >
        <Field label={t("today.cancelReason")} hint={t("today.cancelReasonHint")}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </Field>
      </Dialog>
      {assigning && tables.data ? (
        <TableAssignDialog
          key={assigning.id}
          restaurantId={restaurantId}
          booking={assigning}
          tables={tables.data}
          dayBookings={items}
          onClose={() => setAssigning(null)}
        />
      ) : null}
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

/** Banner for a day with a closure or special hours, so nobody takes a booking by hand on it. */
function ClosureNotice({
  restaurantId,
  exceptions,
  closedAll,
}: {
  restaurantId: string;
  exceptions: ScheduleExceptionDto[];
  closedAll: ScheduleExceptionDto | null;
}) {
  const { t } = useTranslation();
  const services = useQuery(servicesQuery(restaurantId));
  const name = (id: string | null) =>
    id ? (services.data?.find((s) => s.id === id)?.name ?? "") : t("closures.allServices");
  const edit = (
    <Link
      to="/r/$restaurantId/settings/closures"
      params={{ restaurantId }}
      className="font-semibold underline underline-offset-2"
    >
      {t("today.closureEdit")}
    </Link>
  );
  if (closedAll)
    return (
      <Alert tone="warning" className="mt-4 print:hidden">
        <span className="font-semibold">{t("today.closedDay")}</span>
        {closedAll.reason ? ` · ${closedAll.reason}` : ""}
        {" · "}
        {edit}
      </Alert>
    );
  return (
    <Alert tone="info" className="mt-4 print:hidden">
      <span className="font-semibold">{t("today.specialDay")}</span>
      {": "}
      {exceptions
        .map((e) =>
          e.closed
            ? `${name(e.serviceId)} ${t("closures.closed").toLowerCase()}`
            : `${name(e.serviceId)} ${(e.windows ?? []).map((w) => `${w.start}–${w.end}`).join(", ")}`,
        )
        .join(" · ")}
      {exceptions[0]?.reason ? ` · ${exceptions[0].reason}` : ""}
      {" · "}
      {edit}
    </Alert>
  );
}

/** "Close this day" from Today: the closure form with the date filled in. */
function CloseDayDialog({
  restaurantId,
  date,
  onClose,
}: {
  restaurantId: string;
  date: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const services = useQuery(servicesQuery(restaurantId));
  const save = useMutation({
    mutationFn: (v: UpsertScheduleExceptionInput) =>
      api.post(`/api/v1/restaurants/${restaurantId}/schedule-exceptions`, v),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["restaurant", restaurantId, "schedule-exceptions"],
        }),
        queryClient.invalidateQueries({ queryKey: ["availability"] }),
      ]);
      toast.success(t("app.saved"));
      onClose();
    },
    onError: () => toast.error(t("app.error")),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("today.closeDay")}
      description={t("today.closeDayHint")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {t("app.save")}
          </Button>
        </>
      }
    >
      <ExceptionForm
        id={formId}
        initial={defaultExceptionInput(date)}
        services={services.data ?? []}
        onSubmit={(v) => save.mutate(v)}
        busy={save.isPending}
        restaurantId={restaurantId}
      />
    </Dialog>
  );
}

const Sep = () => (
  <span aria-hidden="true" className="text-stone-300">
    ·
  </span>
);

/* Row columns on wide screens: time, guest, party, (table), status, actions. */
const ROW_COLS = "md:grid-cols-[4.25rem_minmax(0,1fr)_5.5rem_8.5rem_10rem]";
const ROW_COLS_FLOOR = "md:grid-cols-[4.25rem_minmax(0,1fr)_5.5rem_8rem_8.5rem_10rem]";

/** Week of tappable days as tabs, with arrows, a date picker and a way back to today. */
function DayStrip({
  date,
  today,
  closedDays,
  onChange,
}: {
  date: string;
  today: string;
  /** Days of the week with a restaurant-wide closure: shown struck through. */
  closedDays: Set<string>;
  onChange: (d: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const pickerRef = useRef<HTMLInputElement>(null);
  const week = startOfWeek(date);
  const days = dateRange(week, 7);
  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if ("showPicker" in el && typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };
  return (
    <div className="mt-4 flex items-center gap-1 border-b border-stone-200 print:hidden">
      <IconButton
        label={t("today.prevWeek")}
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => onChange(addDays(date, -7))}
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        label={t("today.prev")}
        size="sm"
        className="sm:hidden"
        onClick={() => onChange(addDays(date, -1))}
      >
        <ChevronLeft />
      </IconButton>
      <div className="-mb-px grid min-w-0 flex-1 grid-cols-7">
        {days.map((d) => {
          const isSelected = d === date;
          const isToday = d === today;
          const isClosed = closedDays.has(d);
          const [, , dd] = d.split("-");
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              title={isClosed ? t("today.closedDay") : undefined}
              onClick={() => onChange(d)}
              className={cn(
                "flex h-12 flex-col items-center justify-center border-b-2 px-1 transition-colors",
                isSelected
                  ? "border-brand-600 text-stone-900"
                  : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-900",
              )}
            >
              <span className="text-[11px] font-medium tracking-wider uppercase">
                {formatDate(d, i18n.language, { weekday: "short" }).replace(".", "")}
              </span>
              <span
                className={cn(
                  "text-[17px] leading-tight font-semibold tabular-nums",
                  isToday && "text-brand-700",
                  isClosed && "text-stone-400 line-through decoration-stone-400",
                )}
              >
                {Number(dd)}
              </span>
            </button>
          );
        })}
      </div>
      <IconButton
        label={t("today.next")}
        size="sm"
        className="sm:hidden"
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight />
      </IconButton>
      <IconButton
        label={t("today.nextWeek")}
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => onChange(addDays(date, 7))}
      >
        <ChevronRight />
      </IconButton>
      <div className="relative hidden sm:block">
        <IconButton label={t("today.pickDate")} size="sm" onClick={openPicker}>
          <CalendarDays />
        </IconButton>
        <input
          ref={pickerRef}
          type="date"
          aria-hidden="true"
          tabIndex={-1}
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      </div>
      {date !== today ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(today)}>
          {t("today.jumpToday")}
        </Button>
      ) : null}
    </div>
  );
}

function BookingRow({
  booking: b,
  timezone,
  hasFloor,
  busy,
  onOpen,
  onAction,
  onEdit,
  onAssign,
}: {
  booking: BookingDto;
  timezone: string;
  hasFloor: boolean;
  busy: boolean;
  onOpen: () => void;
  onAction: (a: BookingAction) => void;
  onEdit: () => void;
  onAssign: () => void;
}) {
  const { t, i18n } = useTranslation();
  const isActive = ACTIVE_STATUSES.has(b.status);
  const struck = b.status === "cancelled" || b.status === "no_show";
  const primary = primaryActionFor[b.status];
  const secondary = (actionsFor[b.status] ?? []).filter((a) => a !== primary);
  const menu: Array<MenuItem | "separator"> = [];
  if (isActive) menu.push({ label: t("today.edit"), icon: <Pencil />, onSelect: onEdit });
  if (isActive && hasFloor)
    menu.push({ label: t("today.assignTables"), icon: <LayoutGrid />, onSelect: onAssign });
  if (menu.length > 0 && secondary.length > 0) menu.push("separator");
  for (const a of secondary)
    menu.push({
      label: a === "cancel" ? t("today.cancelTitle") : t(`today.actions.${a}`),
      icon: actionIcons[a],
      tone: a === "cancel" || a === "no_show" ? "danger" : "default",
      onSelect: () => onAction(a),
    });
  const flags = [
    b.customer.noShowCount > 0 ? (
      <span key="ns" className="inline-flex items-center gap-1 font-medium text-red-700">
        <UserX className="size-3.5" />
        {t("today.noShows", { count: b.customer.noShowCount })}
      </span>
    ) : null,
    b.customer.cancelCount > 0 ? (
      <span key="cx" className="inline-flex items-center gap-1 font-medium text-amber-700">
        <CalendarX className="size-3.5" />
        {t("today.cancellations", { count: b.customer.cancelCount })}
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <li className={cn("px-4 py-2.5 md:py-2", !isActive && "bg-stone-50/70")}>
      <div
        className={cn(
          "grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-3",
          "[grid-template-areas:'time_name_status'_'party_meta_meta'_'table_table_table'_'actions_actions_actions']",
          "md:[grid-template-areas:'time_name_party_status_actions'] md:items-center",
          hasFloor ? "md:[grid-template-areas:'time_name_party_table_status_actions']" : undefined,
          hasFloor ? ROW_COLS_FLOOR : ROW_COLS,
        )}
      >
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "[grid-area:time] self-start text-left text-[15px] font-semibold tabular-nums md:self-center",
            !isActive && "text-stone-400",
          )}
        >
          {formatTime(b.startsAt, timezone, i18n.language)}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 items-baseline gap-x-2 [grid-area:name] text-left"
          aria-label={t("today.details")}
        >
          <span
            className={cn(
              "min-w-0 truncate text-[15px] font-medium",
              !isActive && "text-stone-500",
              struck && "line-through decoration-stone-300",
            )}
          >
            {b.customer.name}
          </span>
          <span className="hidden min-w-0 shrink-[2] items-baseline gap-x-2 truncate text-[13px] text-stone-500 md:flex">
            {b.customer.phone ? <span className="tabular-nums">{b.customer.phone}</span> : null}
            <span>{t(`today.source.${b.source}`)}</span>
            {flags}
          </span>
        </button>
        <span
          className={cn(
            "[grid-area:party] text-[13px] text-stone-500 tabular-nums md:text-sm md:text-stone-700",
          )}
        >
          {t("today.guests", { count: b.partySize })}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 [grid-area:meta] text-[13px] text-stone-500 md:hidden">
          {b.customer.phone ? <span>{b.customer.phone}</span> : null}
          <span>{t(`today.source.${b.source}`)}</span>
          {flags}
        </span>
        {hasFloor ? (
          <span className="mt-1.5 [grid-area:table] md:mt-0">
            {isActive ? (
              <button
                type="button"
                onClick={onAssign}
                title={t("today.assignTables")}
                className={cn(
                  "inline-flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-xs font-semibold tabular-nums",
                  b.tables.length > 0
                    ? "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
                    : "border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
                )}
              >
                <LayoutGrid className="size-3" />
                <span className="truncate">
                  {b.tables.length > 0
                    ? b.tables.map((x) => x.name).join(" + ")
                    : t("today.noTable")}
                </span>
              </button>
            ) : null}
          </span>
        ) : null}
        <StatusMark status={b.status} muted={!isActive} className="[grid-area:status]" />
        <div className="mt-2 flex items-center gap-1.5 [grid-area:actions] md:mt-0 md:justify-end print:hidden">
          {primary ? (
            <Button
              size="sm"
              variant="outline"
              icon={actionIcons[primary]}
              disabled={busy}
              onClick={() => onAction(primary)}
              className="h-10 flex-1 md:h-8 md:flex-none md:px-2.5"
            >
              {t(`today.actions.${primary}`)}
            </Button>
          ) : null}
          {menu.length > 0 ? (
            <Menu
              items={menu}
              trigger={({ open, toggle }) => (
                <IconButton
                  label={t("today.moreActions")}
                  size="sm"
                  onClick={toggle}
                  aria-expanded={open}
                  className={cn("h-10 w-10 md:size-8", open && "bg-stone-100")}
                >
                  <EllipsisVertical />
                </IconButton>
              )}
            />
          ) : null}
        </div>
      </div>
      {b.notes ? (
        <p className="mt-1 flex items-start gap-1.5 text-[13px] text-amber-900 md:pl-[calc(4.25rem+0.75rem)]">
          <StickyNote className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
          <span className="min-w-0 whitespace-pre-wrap">{b.notes}</span>
        </p>
      ) : null}
    </li>
  );
}

/** The plan at one moment of the day: who sits where, with a time picker. */
function FloorView({
  tables,
  areas,
  bookings,
  timezone,
  date,
  today,
  onPick,
}: {
  tables: Parameters<typeof FloorPlan>[0]["tables"];
  areas: Parameters<typeof FloorPlan>[0]["areas"];
  bookings: BookingDto[];
  timezone: string;
  date: string;
  today: string;
  onPick: (b: BookingDto) => void;
}) {
  const { t, i18n } = useTranslation();
  const nowLocal = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
  const firstStart = bookings[0] ? formatTime(bookings[0].startsAt, timezone, "en-GB") : "20:00";
  const [time, setTime] = useState(date === today ? nowLocal : firstStart);
  // the chosen wall-clock time on that date, as an instant, via the bookings' own offsets
  const probe = (() => {
    const [h, m] = time.split(":").map(Number);
    const sample = bookings[0] ? new Date(bookings[0].startsAt) : new Date(`${date}T12:00:00Z`);
    const sampleLocal = formatTime(sample.toISOString(), timezone, "en-GB");
    const [sh, sm] = sampleLocal.split(":").map(Number);
    return sample.getTime() + (((h ?? 0) - (sh ?? 0)) * 60 + ((m ?? 0) - (sm ?? 0))) * 60_000;
  })();
  const seatedAt = (tableId: string): BookingDto | null =>
    bookings.find(
      (b) =>
        ACTIVE_STATUSES.has(b.status) &&
        b.tables.some((x) => x.id === tableId) &&
        new Date(b.startsAt).getTime() <= probe &&
        new Date(b.endsAt).getTime() > probe,
    ) ?? null;
  const unassigned = bookings.filter((b) => ACTIVE_STATUSES.has(b.status) && b.tables.length === 0);
  const closedRooms = new Set(areas.filter((a) => !a.active).map((a) => a.id));
  const statusOf = (table: (typeof tables)[number]): TableStatus => {
    if (!table.active || (table.areaId !== null && closedRooms.has(table.areaId)))
      return { tone: "inactive" };
    const b = seatedAt(table.id);
    if (!b) return { tone: "free", title: `${table.name} · ${t("today.free")}` };
    return {
      tone: b.status === "seated" ? "seated" : "reserved",
      label: `${b.customer.name} · ${b.partySize}`,
      title: `${table.name} · ${b.customer.name} · ${formatTime(b.startsAt, timezone, i18n.language)}`,
    };
  };
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-stone-200 px-4 py-2">
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          {t("today.floorTime")}
          <input
            type="time"
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            className="h-8 min-h-8 rounded-md border border-stone-300 px-2 text-sm font-semibold tabular-nums"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-stone-600">
          <span className="inline-flex items-center gap-1.5 capitalize">
            <span className="inline-block size-3 rounded-sm border border-stone-300 bg-white" />
            {t("today.free")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border border-amber-500 bg-amber-100" />
            {t("today.status.confirmed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border border-sky-500 bg-sky-100" />
            {t("today.status.seated")}
          </span>
        </div>
      </div>
      <div className="p-3">
        <FloorPlan
          tables={tables}
          areas={areas}
          statusOf={statusOf}
          onSelect={(table) => {
            const b = seatedAt(table.id);
            if (b) onPick(b);
          }}
        />
      </div>
      {unassigned.length > 0 ? (
        <div className="border-t border-stone-200 px-4 py-3">
          <p className="mb-2 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
            {t("today.unassigned")}
          </p>
          <ul className="flex flex-wrap gap-2">
            {unassigned.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-dashed border-amber-400 bg-amber-50 px-2.5 text-[13px] font-medium text-amber-900 hover:bg-amber-100"
                >
                  <span className="font-semibold tabular-nums">
                    {formatTime(b.startsAt, timezone, i18n.language)}
                  </span>
                  {b.customer.name}
                  <span className="text-amber-700 tabular-nums">{b.partySize}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Open or close rooms for the day: a closed room's seats and tables leave the bookings. */
function RoomsDialog({
  restaurantId,
  rooms,
  open,
  onClose,
}: {
  restaurantId: string;
  rooms: AreaDto[];
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const toggle = useMutation({
    mutationFn: ({ room, active }: { room: AreaDto; active: boolean }) => {
      const body: UpsertAreaInput = {
        name: room.name,
        sortOrder: room.sortOrder,
        active,
        seats: room.seats,
      };
      return api.put(`/api/v1/restaurants/${restaurantId}/areas/${room.id}`, body);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "areas"] }),
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] }),
        queryClient.invalidateQueries({ queryKey: ["availability"] }),
      ]);
      toast.success(t("app.saved"));
    },
    onError: () => toast.error(t("app.error")),
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("today.rooms")}
      description={t("today.roomsHint")}
    >
      <ul className="divide-y divide-stone-100">
        {rooms.map((r) => (
          <li key={r.id} className="flex items-center gap-4 py-3">
            <span
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
                r.active ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-400",
              )}
            >
              <DoorOpen className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-semibold", !r.active && "text-stone-500")}>
                {r.name}
              </p>
              <p className="text-sm text-stone-500">
                {r.seats === null
                  ? t("rooms.seatsUnset")
                  : t("rooms.seatsCount", { count: r.seats })}
              </p>
            </div>
            <Switch
              checked={r.active}
              label={r.active ? t("rooms.open") : t("rooms.closed")}
              disabled={toggle.isPending}
              onChange={(active) => toggle.mutate({ room: r, active })}
            />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
