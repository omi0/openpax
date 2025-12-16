import type { CustomerDto, UpdateCustomerInput } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, X } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
  Textarea,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import {
  customerBookingsQuery,
  customerQuery,
  customerTagsQuery,
  meQuery,
  restaurantQuery,
} from "@/lib/queries";
import { formatDate, formatDateTime, formatTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/customers/$customerId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(customerQuery(params.restaurantId, params.customerId)),
  component: CustomerPage,
});

const toInput = (c: CustomerDto): UpdateCustomerInput => ({
  name: c.name,
  email: c.email,
  phone: c.phone,
  locale: c.locale,
  tags: c.tags,
  notes: c.notes,
  marketingConsent: c.marketingConsent,
});

function CustomerPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId, customerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: customer } = useSuspenseQuery(customerQuery(restaurantId, customerId));
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const history = useQuery(customerBookingsQuery(restaurantId, customerId));
  const tags = useQuery(customerTagsQuery(restaurantId));
  const [form, setForm] = useState<UpdateCustomerInput>(() => toInput(customer));
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "customers"] }),
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "customer-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "bookings"] }),
    ]);

  const save = useMutation({
    mutationFn: (body: UpdateCustomerInput) =>
      api.patch<CustomerDto>(`/api/v1/restaurants/${restaurantId}/customers/${customerId}`, body),
    onSuccess: async (c) => {
      setForm(toInput(c));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await invalidate();
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.code.startsWith("duplicate_"))
        setError(t("customers.duplicate", { field: t(`customers.${e.code.slice(10)}`) }));
      else if (e instanceof ApiClientError && e.code === "invalid_phone")
        setError(t("customers.invalidPhone"));
      else setError(e instanceof ApiClientError ? e.message : t("app.error"));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/v1/restaurants/${restaurantId}/customers/${customerId}`),
    onSuccess: async () => {
      await invalidate();
      await navigate({ to: "/r/$restaurantId/customers", params: { restaurantId } });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate({
      ...form,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      notes: form.notes?.trim() || null,
    });
  };

  const addTag = (raw: string) => {
    const tag = raw.trim().toLowerCase();
    if (!tag) return;
    const current = form.tags ?? [];
    if (!current.includes(tag)) setForm({ ...form, tags: [...current, tag] });
    setTagDraft("");
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagDraft);
    } else if (e.key === "Backspace" && tagDraft === "" && form.tags?.length) {
      setForm({ ...form, tags: form.tags.slice(0, -1) });
    }
  };

  const bookings = history.data?.items ?? [];

  return (
    <div>
      <Link
        to="/r/$restaurantId/customers"
        params={{ restaurantId }}
        className="mb-3 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="size-4" /> {t("customers.back")}
      </Link>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{customer.name}</h1>
        {customer.tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("customers.stats.visits")} value={customer.visitCount} />
        <Stat
          label={t("customers.stats.noShows")}
          value={customer.noShowCount}
          tone={customer.noShowCount > 0 ? "text-red-600" : undefined}
        />
        <Stat label={t("customers.stats.bookings")} value={history.data?.total ?? "…"} />
        <Stat
          label={t("customers.stats.lastVisit")}
          value={
            customer.lastVisitAt
              ? formatDateTime(customer.lastVisitAt, restaurant.timezone, i18n.language)
              : t("customers.never")
          }
          small
        />
        <Stat
          label={t("customers.stats.since")}
          value={formatDate(customer.createdAt.slice(0, 10), i18n.language, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
          small
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title={t("customers.profile")} className="lg:col-span-3">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label={t("customers.name")} className="sm:col-span-2">
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={120}
              />
            </Field>
            <Field label={t("customers.phone")}>
              <Input
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label={t("customers.email")}>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label={t("customers.language")}>
              <Select
                value={form.locale ?? ""}
                onChange={(e) =>
                  setForm({ ...form, locale: (e.target.value || null) as "it" | "en" | null })
                }
              >
                <option value="">{t("customers.languageUnknown")}</option>
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <div className="flex items-center gap-3 self-end pb-2">
              <Switch
                checked={form.marketingConsent ?? false}
                onChange={(marketingConsent) => setForm({ ...form, marketingConsent })}
                label={t("customers.marketing")}
              />
              <span className="text-sm">{t("customers.marketing")}</span>
            </div>
            <Field
              label={t("customers.tags")}
              hint={t("customers.tagHint")}
              className="sm:col-span-2"
            >
              <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
                {(form.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`${t("app.delete")} ${tag}`}
                      className="rounded-full hover:bg-zinc-200"
                      onClick={() =>
                        setForm({ ...form, tags: (form.tags ?? []).filter((x) => x !== tag) })
                      }
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  list="customer-tag-suggestions"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={() => addTag(tagDraft)}
                  placeholder={t("customers.addTag")}
                  className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
                  maxLength={40}
                />
                <datalist id="customer-tag-suggestions">
                  {(tags.data ?? [])
                    .filter((x) => !(form.tags ?? []).includes(x.tag))
                    .map((x) => (
                      <option key={x.tag} value={x.tag} />
                    ))}
                </datalist>
              </div>
            </Field>
            <Field
              label={t("customers.notes")}
              hint={t("customers.notesHint")}
              className="sm:col-span-2"
            >
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={2000}
              />
            </Field>
            {error ? (
              <div className="sm:col-span-2">
                <Alert>{error}</Alert>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              {saved ? <span className="text-sm text-emerald-700">{t("app.saved")}</span> : null}
              <Button type="submit" loading={save.isPending}>
                {t("app.save")}
              </Button>
            </div>
          </form>
          {role !== "staff" ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4">
              <p className="text-xs text-zinc-500">{t("customers.deleteHint")}</p>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600"
                loading={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("customers.confirmDelete"))) remove.mutate();
                }}
              >
                {t("customers.delete")}
              </Button>
            </div>
          ) : null}
        </Card>

        <Card title={t("customers.history")} className="lg:col-span-2">
          {history.isLoading ? (
            <Spinner />
          ) : bookings.length === 0 ? (
            <EmptyState>{t("customers.noHistory")}</EmptyState>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {bookings.map((b) => (
                <li key={b.id} className="py-2 text-sm">
                  <Link
                    to="/r/$restaurantId/today"
                    params={{ restaurantId }}
                    search={{ date: b.serviceDate }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:text-brand"
                  >
                    <span className="capitalize">
                      {formatDate(b.serviceDate, i18n.language, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span className="font-mono">
                      {formatTime(b.startsAt, restaurant.timezone, i18n.language)}
                    </span>
                    <span className="text-zinc-500">
                      {b.partySize} · {b.serviceName}
                    </span>
                    <Badge tone={b.status}>{t(`today.status.${b.status}`)}</Badge>
                    <span className="text-xs text-zinc-400">{t(`today.source.${b.source}`)}</span>
                  </Link>
                  {b.notes ? <p className="mt-0.5 text-xs text-zinc-500">{b.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string | number;
  tone?: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`${small ? "text-sm" : "text-xl"} font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
