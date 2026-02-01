import type {
  BookingPolicyDto,
  CreateWaitlistEntryInput,
  RestaurantDto,
  WaitlistEntryDto,
} from "@sitli/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Phone, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { availabilityQuery, policyQuery, waitlistQuery } from "@/lib/queries";
import { formatDateTime, formatTime } from "@/lib/utils";

const OPEN = ["waiting", "offered"];

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
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">{t("waitlist.title")}</h2>
        <span className="text-sm text-zinc-500">{t("waitlist.count", { count: open.length })}</span>
        {closed.length > 0 ? (
          <button
            type="button"
            className="text-xs text-zinc-500 hover:text-zinc-900"
            onClick={() => setShowClosed(!showClosed)}
          >
            {t("waitlist.showClosed")} ({closed.length})
          </button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          onClick={() => setDialog({ kind: "add" })}
        >
          <Plus className="size-4" /> {t("waitlist.add")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState>{t("waitlist.empty")}</EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="w-8 text-center text-sm font-semibold">{e.partySize}</span>
              <div className="min-w-0 flex-1">
                <Link
                  to="/r/$restaurantId/customers/$customerId"
                  params={{ restaurantId: restaurant.id, customerId: e.customer.id }}
                  className="font-medium hover:text-brand"
                >
                  {e.customer.name}
                </Link>
                {e.customer.phone ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                    <Phone className="size-3" /> {e.customer.phone}
                  </span>
                ) : null}
                <p className="text-xs text-zinc-500">
                  {e.preferredTime
                    ? `${t("waitlist.preferred", { time: e.preferredTime })} · `
                    : ""}
                  {e.serviceName ? `${e.serviceName} · ` : ""}
                  {t("waitlist.joined", {
                    when: formatDateTime(e.createdAt, restaurant.timezone, i18n.language),
                  })}
                  {e.offer && e.status === "offered"
                    ? ` · ${t("waitlist.offered", { time: formatTime(e.offer.startsAt, restaurant.timezone, i18n.language) })}, ${t("waitlist.offerUntil", { time: formatDateTime(e.offer.expiresAt, restaurant.timezone, i18n.language) })}`
                    : ""}
                </p>
                {e.notes ? <p className="text-sm text-zinc-600">{e.notes}</p> : null}
              </div>
              <Badge
                tone={
                  e.status === "offered"
                    ? "pending"
                    : e.status === "booked"
                      ? "confirmed"
                      : e.status === "waiting"
                        ? "neutral"
                        : "cancelled"
                }
              >
                {t(`waitlist.status.${e.status}`)}
              </Badge>
              {OPEN.includes(e.status) ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog({ kind: "offer", entry: e })}
                  >
                    {t("waitlist.actions.offer")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setDialog({ kind: "book", entry: e })}
                  >
                    {t("waitlist.actions.book")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(t("waitlist.confirmRemove"))) remove.mutate(e.id);
                    }}
                  >
                    {t("waitlist.actions.remove")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
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
    >
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">
          {entry.customer.name} · {entry.partySize} ·{" "}
          {entry.preferredTime ? t("waitlist.preferred", { time: entry.preferredTime }) : ""}
        </p>
        <p className="text-xs text-zinc-500">
          {mode === "offer"
            ? t("waitlist.offerHint", { minutes: policy?.waitlistOfferMinutes ?? 120 })
            : t("waitlist.bookHint")}
        </p>
        <Field label={t("waitlist.form.slot")}>
          <Select value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">{slots.length === 0 ? t("waitlist.form.noSlots") : "—"}</option>
            {slots.map((s) => (
              <option
                key={`${s.serviceId}|${s.startsAt}`}
                value={`${s.serviceId}|${s.startsAt}`}
                disabled={!s.available && !allowUnavailable}
              >
                {s.startLocal}
                {services.length > 1
                  ? ` · ${services.find((x) => x.id === s.serviceId)?.name ?? ""}`
                  : ""}
                {!s.available
                  ? ` (${s.reason === "full" ? t("waitlist.form.full") : s.reason})`
                  : ""}
              </option>
            ))}
          </Select>
        </Field>
        {allowUnavailable ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={ignoreCapacity}
              onChange={(e) => setIgnoreCapacity(e.target.checked)}
            />
            {t("waitlist.form.ignoreCapacity")}
          </label>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button disabled={!slot} loading={run.isPending} onClick={() => run.mutate()}>
            {mode === "offer" ? t("waitlist.sendOffer") : t("waitlist.confirmBook")}
          </Button>
        </div>
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
      partySize: Number(f.get("partySize")) || 2,
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
    <Dialog open onClose={onClose} title={t("waitlist.addTitle")}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label={t("waitlist.form.date")}>
          <Input type="date" name="date" defaultValue={date} required />
        </Field>
        <Field label={t("waitlist.form.party")}>
          <Input type="number" name="partySize" min={1} max={100} defaultValue={2} required />
        </Field>
        <Field label={t("waitlist.form.name")} className="sm:col-span-2">
          <Input name="name" required />
        </Field>
        <Field label={t("waitlist.form.phone")}>
          <Input name="phone" type="tel" />
        </Field>
        <Field label={t("waitlist.form.email")}>
          <Input name="email" type="email" />
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
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button type="submit" loading={create.isPending}>
            {t("waitlist.add")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
