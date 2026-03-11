import type { BookingAction } from "@sitli/core";
import type { AreaDto, BookingDto, UpsertAreaInput } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Armchair,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  EllipsisVertical,
  LayoutGrid,
  List,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Users,
  UserX,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookingEditDialog } from "@/components/booking-edit-dialog";
import { BookingFormDialog } from "@/components/booking-form-dialog";
import {
  ACTIVE_STATUSES,
  actionIcons,
  actionsFor,
  actionVariant,
  BookingSheet,
  primaryActionFor,
} from "@/components/booking-sheet";
import { FloorPlan, type TableStatus } from "@/components/floor-plan";
import { TableAssignDialog } from "@/components/table-assign-dialog";
import {
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Menu,
  type MenuItem,
  PageLoader,
  Segmented,
  StatusBadge,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { WaitlistPanel } from "@/components/waitlist-panel";
import { api } from "@/lib/api";
import { areasQuery, bookingsQuery, meQuery, restaurantQuery, tablesQuery } from "@/lib/queries";
import {
  addDays,
  cn,
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
  const tables = useQuery(tablesQuery(restaurantId));
  const areas = useQuery(areasQuery(restaurantId));
  const hasFloor = (tables.data?.length ?? 0) > 0;
  const rooms = areas.data ?? [];
  const closedRooms = rooms.filter((r) => !r.active);

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

  return (
    <div>
      <DayStrip date={date} today={today} onChange={setDate} />

      <div className="mt-4 mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize md:text-[28px]">
            {date === today ? t("today.title") : formatDate(date, i18n.language)}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-stone-500">
            {date === today ? (
              <span className="capitalize">{formatDate(date, i18n.language)}</span>
            ) : null}
            {date === today ? <span aria-hidden="true">·</span> : null}
            <span>
              {t("today.bookings", { count: active.length })} ·{" "}
              {t("today.covers", { count: covers })}
            </span>
            {seatedNow > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[13px] font-medium text-sky-900">
                <Armchair className="size-3.5" /> {t("today.seatedNow", { count: seatedNow })}
              </span>
            ) : null}
            {pending > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-medium text-amber-900">
                <Clock className="size-3.5" /> {t("today.toConfirm", { count: pending })}
              </span>
            ) : null}
            {closedRooms.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-medium text-amber-900"
              >
                <DoorOpen className="size-3.5" /> {t("today.roomClosed", { name: r.name })}
              </span>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rooms.length > 0 ? (
            <Button variant="outline" icon={<DoorOpen />} onClick={() => setRoomsOpen(true)}>
              {t("today.rooms")}
            </Button>
          ) : null}
          {hasFloor ? (
            <Segmented
              ariaLabel={t("today.viewLabel")}
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: t("today.listView"), icon: <List /> },
                { value: "floor", label: t("today.floorView"), icon: <LayoutGrid /> },
              ]}
            />
          ) : null}
          <Button size="lg" icon={<Plus />} onClick={() => setOpen(true)}>
            {t("today.newBooking")}
          </Button>
        </div>
      </div>

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
        <EmptyState
          icon={<CalendarDays />}
          title={t("today.noBookings")}
          action={
            <Button icon={<Plus />} onClick={() => setOpen(true)}>
              {t("today.newBooking")}
            </Button>
          }
        >
          {t("today.noBookingsHint")}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const gActive = g.items.filter((b) => ACTIVE_STATUSES.has(b.status));
            return (
              <section key={g.id}>
                {groups.length > 1 ? (
                  <h2 className="mb-2 flex items-baseline gap-2 px-1">
                    <span className="text-base font-semibold">{g.name}</span>
                    <span className="text-sm text-stone-500">
                      {t("today.bookings", { count: gActive.length })} ·{" "}
                      {t("today.covers", {
                        count: gActive.reduce((n, b) => n + b.partySize, 0),
                      })}
                    </span>
                  </h2>
                ) : null}
                <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
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

      <WaitlistPanel restaurant={restaurant} date={date} canOverride={role !== "staff"} />

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

/** Seven tappable days around the chosen date, plus arrows and a date picker for jumps. */
function DayStrip({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
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
    <div className="flex items-center gap-2">
      <IconButton
        label={t("today.prevWeek")}
        variant="outline"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => onChange(addDays(date, -7))}
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        label={t("today.prev")}
        variant="outline"
        size="sm"
        className="sm:hidden"
        onClick={() => onChange(addDays(date, -1))}
      >
        <ChevronLeft />
      </IconButton>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1 rounded-2xl border border-stone-200 bg-white p-1 shadow-card">
        {days.map((d) => {
          const isSelected = d === date;
          const isToday = d === today;
          const [, , dd] = d.split("-");
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              onClick={() => onChange(d)}
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-xl transition-colors",
                isSelected
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-stone-700 hover:bg-stone-100",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  isSelected ? "text-white/80" : "text-stone-500",
                )}
              >
                {formatDate(d, i18n.language, { weekday: "short" }).replace(".", "")}
              </span>
              <span className="text-lg leading-tight font-bold tabular-nums">{Number(dd)}</span>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-1 rounded-full",
                  isToday ? (isSelected ? "bg-white" : "bg-brand-600") : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>
      <IconButton
        label={t("today.next")}
        variant="outline"
        size="sm"
        className="sm:hidden"
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronRight />
      </IconButton>
      <IconButton
        label={t("today.nextWeek")}
        variant="outline"
        size="sm"
        className="hidden sm:inline-flex"
        onClick={() => onChange(addDays(date, 7))}
      >
        <ChevronRight />
      </IconButton>
      <div className="relative hidden sm:block">
        <IconButton label={t("today.pickDate")} variant="outline" size="sm" onClick={openPicker}>
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

  return (
    <li className={cn("px-3 py-3 md:px-4", !isActive && "bg-stone-50/60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "w-[3.25rem] shrink-0 text-left text-xl font-bold tabular-nums",
            !isActive && "text-stone-400",
          )}
        >
          {formatTime(b.startsAt, timezone, i18n.language)}
        </button>
        <Avatar
          name={b.customer.name}
          size="md"
          className={cn("hidden md:inline-flex", !isActive && "opacity-50")}
        />
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 basis-40 text-left"
          aria-label={t("today.details")}
        >
          <span
            className={cn(
              "block truncate text-base font-semibold",
              !isActive && "text-stone-500 line-through decoration-stone-300",
            )}
          >
            {b.customer.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-stone-500">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {t("today.guests", { count: b.partySize })}
            </span>
            {b.customer.phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {b.customer.phone}
              </span>
            ) : null}
            {b.customer.noShowCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-red-600">
                <UserX className="size-3.5" />{" "}
                {t("today.noShows", { count: b.customer.noShowCount })}
              </span>
            ) : null}
            <span className="text-stone-400">{t(`today.source.${b.source}`)}</span>
          </span>
        </button>
        {hasFloor && isActive ? (
          <button
            type="button"
            onClick={onAssign}
            title={t("today.assignTables")}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-sm font-semibold",
              b.tables.length > 0
                ? "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                : "border-dashed border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100",
            )}
          >
            <LayoutGrid className="size-3.5" />
            {b.tables.length > 0 ? b.tables.map((x) => x.name).join(" + ") : t("today.noTable")}
          </button>
        ) : null}
        <StatusBadge status={b.status} />
        <div className="flex basis-full items-center gap-2 md:basis-auto">
          {primary ? (
            <Button
              size="md"
              variant={actionVariant[primary]}
              icon={actionIcons[primary]}
              disabled={busy}
              onClick={() => onAction(primary)}
              className="flex-1 md:flex-none"
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
                  variant="outline"
                  onClick={toggle}
                  aria-expanded={open}
                  className={cn(open && "bg-stone-100")}
                >
                  <EllipsisVertical />
                </IconButton>
              )}
            />
          ) : null}
        </div>
      </div>
      {b.notes ? (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 md:ml-[4.75rem]">
          <StickyNote className="mt-0.5 size-4 shrink-0 text-amber-600" />
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-card">
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          {t("today.floorTime")}
          <input
            type="time"
            value={time}
            onChange={(e) => e.target.value && setTime(e.target.value)}
            className="h-10 rounded-xl border border-stone-300 px-2.5 text-[15px] font-semibold tabular-nums"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-600">
          <span className="inline-flex items-center gap-1.5 capitalize">
            <span className="inline-block size-3.5 rounded-md border border-stone-300 bg-white" />
            {t("today.free")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3.5 rounded-md border border-amber-500 bg-amber-100" />
            {t("today.status.confirmed")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-3.5 rounded-md border border-sky-500 bg-sky-100" />
            {t("today.status.seated")}
          </span>
        </div>
      </div>
      <FloorPlan
        tables={tables}
        areas={areas}
        statusOf={statusOf}
        onSelect={(table) => {
          const b = seatedAt(table.id);
          if (b) onPick(b);
        }}
      />
      {unassigned.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3">
          <p className="mb-2 text-sm font-semibold text-amber-900">{t("today.unassigned")}</p>
          <ul className="flex flex-wrap gap-2">
            {unassigned.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b)}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-sm font-medium hover:bg-amber-100"
                >
                  <span className="tabular-nums">
                    {formatTime(b.startsAt, timezone, i18n.language)}
                  </span>
                  {b.customer.name}
                  <span className="text-stone-500">{b.partySize}</span>
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
                "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                r.active ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-400",
              )}
            >
              <DoorOpen className="size-5" />
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
