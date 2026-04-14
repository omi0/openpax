import type {
  BookingPolicyDto,
  CreateWaitlistEntryInput,
  RestaurantDto,
  WaitlistEntryDto,
} from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarCheck, Hourglass, Phone, Plus, Send, Trash, Users } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlotPicker } from "@/components/slot-picker";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  Spinner,
  Stepper,
  Textarea,
  useConfirm,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { availabilityQuery, policyQuery, waitlistQuery } from "@/lib/queries";
import { cn, formatDateTime, formatTime } from "@/lib/utils";

const OPEN = ["waiting", "offered"];

const statusTone: Record<string, string> = {
  waiting: "neutral",
  offered: "warning",
  booked: "success",
  expired: "neutral",
  cancelled: "danger",
};

/** Guests queued for a date, with the staff actions: offer a slot, book them in, remove. */
export function WaitlistPanel({
  restaurant,
  date,
  canOverride,
}: {
  restaurant: RestaurantDto;
  date: string;
  canOverride: boolean;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const entries = useQuery(waitlistQuery(restaurant.id, date));
  const policy = useQuery(policyQuery(restaurant.id));
  const [showClosed, setShowClosed] = useState(false);
  const [dialog, setDialog] = useState<
    { kind: "offer" | "book"; entry: WaitlistEntryDto } | { kind: "add" } | null
  >(null);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "waitlist"] }),
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurant.id, "bookings"] }),
    ]);
  const remove = useMutation({
    mutationFn: (id: string) =>
      api.post(`/api/v1/restaurants/${restaurant.id}/waitlist/${id}/cancel`),
    onSuccess: invalidate,
  });

  const all = entries.data?.items ?? [];
  const open = all.filter((e) => OPEN.includes(e.status));
  const closed = all.filter((e) => !OPEN.includes(e.status));
  const rows = showClosed ? all : open;
  // nothing to show and the feature is off: keep the page quiet
  if (!entries.data || (all.length === 0 && !policy.data?.waitlistEnabled)) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Hourglass className="size-5 text-stone-400" /> {t("waitlist.title")}
        </h2>
        <span className="text-sm text-stone-500">
          {t("waitlist.count", { count: open.length })}
        </span>
        {closed.length > 0 ? (
          <button
            type="button"
            className="text-sm text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline"
            onClick={() => setShowClosed(!showClosed)}
          >
            {t("waitlist.showClosed")} ({closed.length})
          </button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          icon={<Plus />}
          className="ml-auto"
          onClick={() => setDialog({ kind: "add" })}
        >
          {t("waitlist.add")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Hourglass />}>{t("waitlist.empty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">
          {rows.map((e) => {
            const isOpen = OPEN.includes(e.status);
            return (
              <li
                key={e.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 md:px-4",
                  !isOpen && "bg-stone-50/60",
                )}
              >
                <Avatar name={e.customer.name} className={cn(!isOpen && "opacity-50")} />
                <div className="min-w-0 flex-1 basis-40">
                  <Link
                    to="/r/$restaurantId/customers/$customerId"
                    params={{ restaurantId: restaurant.id, customerId: e.customer.id }}
                    className="block truncate text-base font-semibold hover:text-brand-700"
                  >
                    {e.customer.name}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-stone-500">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" /> {t("today.guests", { count: e.partySize })}
                    </span>
                    {e.customer.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3.5" /> {e.customer.phone}
                      </span>
                    ) : null}
                    {e.preferredTime ? (
                      <span>{t("waitlist.preferred", { time: e.preferredTime })}</span>
                    ) : null}
                    {e.serviceName ? <span>{e.serviceName}</span> : null}
                  </p>
                  <p className="text-[13px] text-stone-400">
                    {t("waitlist.joined", {
                      when: formatDateTime(e.createdAt, restaurant.timezone, i18n.language),
                    })}
                    {e.offer && e.status === "offered"
                      ? ` · ${t("waitlist.offered", { time: formatTime(e.offer.startsAt, restaurant.timezone, i18n.language) })}, ${t("waitlist.offerUntil", { time: formatDateTime(e.offer.expiresAt, restaurant.timezone, i18n.language) })}`
                      : ""}
                  </p>
                  {e.notes ? <p className="mt-1 text-sm text-stone-600">{e.notes}</p> : null}
                </div>
                <Badge tone={statusTone[e.status] ?? "neutral"}>
                  {t(`waitlist.status.${e.status}`)}
                </Badge>
                {isOpen ? (
                  <div className="flex basis-full flex-wrap gap-2 md:basis-auto">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Send />}
                      onClick={() => setDialog({ kind: "offer", entry: e })}
                    >
                      {t("waitlist.actions.offer")}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<CalendarCheck />}
                      onClick={() => setDialog({ kind: "book", entry: e })}
                    >
                      {t("waitlist.actions.book")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash />}
                      disabled={remove.isPending}
                      onClick={async () => {
                        if (await confirm({ title: t("waitlist.confirmRemove") }))
                          remove.mutate(e.id);
                      }}
                    >
                      {t("waitlist.actions.remove")}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "offer" || dialog?.kind === "book" ? (
        <SlotDialog
          key={`${dialog.kind}-${dialog.entry.id}`}
          restaurant={restaurant}
          entry={dialog.entry}
          mode={dialog.kind}
          policy={policy.data}
          canOverride={canOverride}
          onClose={() => setDialog(null)}
          onDone={async () => {
            await invalidate();
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "add" ? (
        <AddDialog
          restaurant={restaurant}
          date={date}
          onClose={() => setDialog(null)}
          onDone={async () => {
            await invalidate();
            setDialog(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** Pick a slot for the entry's party size, then offer it or book it. */
function SlotDialog({
  restaurant,
  entry,
  mode,
  policy,
  canOverride,
  onClose,
  onDone,
}: {
  restaurant: RestaurantDto;
  entry: WaitlistEntryDto;
  mode: "offer" | "book";
  policy: BookingPolicyDto | undefined;
  canOverride: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const availability = useQuery(
    availabilityQuery(restaurant.slug, entry.serviceDate, entry.partySize),
  );
  const [slot, setSlot] = useState(
    entry.offer ? `${entry.offer.serviceId}|${entry.offer.startsAt}` : "",
  );
  const [ignoreCapacity, setIgnoreCapacity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => {
      const [serviceId, startsAt] = slot.split("|");
      return api.post(`/api/v1/restaurants/${restaurant.id}/waitlist/${entry.id}/${mode}`, {
        serviceId,
        startsAt,
        ...(mode === "book" ? { ignoreCapacity } : {}),
      });
    },
    onSuccess: onDone,
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const slots = availability.data?.slots ?? [];
  const services = availability.data?.services ?? [];
  const allowUnavailable = mode === "book" && canOverride;

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "offer" ? t("waitlist.offerTitle") : t("waitlist.bookTitle")}
      description={`${entry.customer.name} · ${t("today.guests", { count: entry.partySize })}${
        entry.preferredTime ? ` · ${t("waitlist.preferred", { time: entry.preferredTime })}` : ""
      }`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button disabled={!slot} loading={run.isPending} onClick={() => run.mutate()}>
            {mode === "offer" ? t("waitlist.sendOffer") : t("waitlist.confirmBook")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="info">
          {mode === "offer"
            ? t("waitlist.offerHint", { minutes: policy?.waitlistOfferMinutes ?? 120 })
            : t("waitlist.bookHint")}
        </Alert>
        <div>
          <p className="mb-1.5 text-sm font-medium text-stone-700">{t("waitlist.form.slot")}</p>
          {availability.isLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : (
            <SlotPicker
              options={slots.map((s) => ({
                key: `${s.serviceId}|${s.startsAt}`,
                serviceId: s.serviceId,
                label: s.startLocal,
                available: s.available,
                reason: s.reason,
              }))}
              services={services}
              value={slot}
              onChange={setSlot}
              allowUnavailable={allowUnavailable}
              emptyLabel={t("waitlist.form.noSlots")}
            />
          )}
        </div>
        {allowUnavailable ? (
          <Checkbox
            checked={ignoreCapacity}
            onChange={(e) => setIgnoreCapacity(e.target.checked)}
            label={t("waitlist.form.ignoreCapacity")}
          />
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>
    </Dialog>
  );
}

function AddDialog({
  restaurant,
  date,
  onClose,
  onDone,
}: {
  restaurant: RestaurantDto;
  date: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const [partySize, setPartySize] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: CreateWaitlistEntryInput) =>
      api.post(`/api/v1/restaurants/${restaurant.id}/waitlist`, body),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    create.mutate({
      serviceDate: String(f.get("date")),
      partySize,
      preferredTime: String(f.get("preferredTime") || "") || null,
      customer: {
        name: String(f.get("name")),
        phone: String(f.get("phone") || "") || undefined,
        email: String(f.get("email") || "") || undefined,
      },
      notes: String(f.get("notes") || "") || undefined,
      source: "phone",
    });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={t("waitlist.addTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={create.isPending}>
            {t("waitlist.add")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("waitlist.form.date")}>
          <Input type="date" name="date" defaultValue={date} required />
        </Field>
        <Field label={t("waitlist.form.party")}>
          <Stepper value={partySize} onChange={setPartySize} min={1} max={100} />
        </Field>
        <Field label={t("waitlist.form.name")} className="sm:col-span-2" required>
          <Input name="name" required />
        </Field>
        <Field label={t("waitlist.form.phone")}>
          <Input name="phone" type="tel" inputMode="tel" />
        </Field>
        <Field label={t("waitlist.form.email")}>
          <Input name="email" type="email" inputMode="email" />
        </Field>
        <Field label={t("waitlist.form.preferredTime")}>
          <Input name="preferredTime" type="time" />
        </Field>
        <Field label={t("waitlist.form.notes")} className="sm:col-span-2">
          <Textarea name="notes" maxLength={1000} />
        </Field>
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}
