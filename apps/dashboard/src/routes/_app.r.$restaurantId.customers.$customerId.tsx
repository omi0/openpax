import type { CustomerDto, CustomerDuplicateDto, UpdateCustomerInput } from "@sitli/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  CalendarX,
  ClipboardList,
  Mail,
  Merge,
  Phone,
  StickyNote,
  Trash,
  UserX,
  X,
} from "lucide-react";
import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageLoader,
  Select,
  Stat,
  StatusBadge,
  Switch,
  Textarea,
  useConfirm,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import {
  customerBookingsQuery,
  customerDuplicatesQuery,
  customerQuery,
  customersQuery,
  customerTagsQuery,
  meQuery,
  restaurantQuery,
} from "@/lib/queries";
import { cn, formatDate, formatDateTime, formatTime } from "@/lib/utils";

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

const ACTIVE = new Set(["pending", "confirmed", "seated"]);

function CustomerPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId, customerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const formId = useId();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const { data: customer } = useSuspenseQuery(customerQuery(restaurantId, customerId));
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const history = useQuery(customerBookingsQuery(restaurantId, customerId));
  const tags = useQuery(customerTagsQuery(restaurantId));
  const [form, setForm] = useState<UpdateCustomerInput>(() => toInput(customer));
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      toast.success(t("app.saved"));
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
  const merge = useMutation({
    mutationFn: (sourceId: string) =>
      api.post<CustomerDto>(`/api/v1/restaurants/${restaurantId}/customers/${customerId}/merge`, {
        sourceId,
      }),
    onSuccess: async (c) => {
      setForm(toInput(c));
      toast.success(t("customers.duplicates.merged"));
      await invalidate();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
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
        className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-sm font-medium text-stone-600 hover:text-stone-900"
      >
        <ArrowLeft className="size-4" /> {t("customers.back")}
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Avatar name={customer.name} size="lg" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-[28px]">{customer.name}</h1>
          {customer.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-1 text-[13px] font-medium text-brand-800"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {customer.phone ? (
            <a
              href={`tel:${customer.phone.replace(/\s+/g, "")}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-xs hover:bg-stone-50"
            >
              <Phone className="size-[18px]" /> {t("today.call")}
            </a>
          ) : null}
          {customer.email ? (
            <a
              href={`mailto:${customer.email}`}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-xs hover:bg-stone-50"
            >
              <Mail className="size-[18px]" /> {t("today.emailGuest")}
            </a>
          ) : null}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Stat
          label={t("customers.stats.visits")}
          value={customer.visitCount}
          icon={<CalendarDays />}
          tone="brand"
        />
        <Stat
          label={t("customers.stats.noShows")}
          value={customer.noShowCount}
          icon={<UserX />}
          tone={customer.noShowCount > 0 ? "bad" : "neutral"}
        />
        <Stat
          label={t("customers.stats.cancellations")}
          value={customer.cancelCount}
          icon={<CalendarX />}
          tone={customer.cancelCount > 0 ? "warn" : "neutral"}
        />
        <Stat
          label={t("customers.stats.bookings")}
          value={history.data?.total ?? "…"}
          icon={<ClipboardList />}
        />
        <Stat
          label={t("customers.stats.lastVisit")}
          value={
            <span className="text-base">
              {customer.lastVisitAt
                ? formatDateTime(customer.lastVisitAt, restaurant.timezone, i18n.language)
                : t("customers.never")}
            </span>
          }
        />
        <Stat
          label={t("customers.stats.since")}
          value={
            <span className="text-base">
              {formatDate(customer.createdAt.slice(0, 10), i18n.language, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          }
          icon={<CalendarPlus />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card
            title={t("customers.profile")}
            footer={
              <Button type="submit" form={formId} loading={save.isPending}>
                {t("app.save")}
              </Button>
            }
          >
            <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              <Field label={t("customers.name")} className="sm:col-span-2" required>
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
                  inputMode="tel"
                  value={form.phone ?? ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label={t("customers.email")}>
                <Input
                  type="email"
                  inputMode="email"
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
              <div className="flex items-end pb-1.5">
                <Switch
                  checked={form.marketingConsent ?? false}
                  onChange={(marketingConsent) => setForm({ ...form, marketingConsent })}
                  label={t("customers.marketing")}
                />
              </div>
              <Field
                label={t("customers.tags")}
                hint={t("customers.tagHint")}
                className="sm:col-span-2"
              >
                <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 shadow-xs focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15">
                  {(form.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-2.5 text-[13px] font-medium text-brand-800"
                    >
                      {tag}
                      <button
                        type="button"
                        aria-label={`${t("app.delete")} ${tag}`}
                        className="inline-flex size-5 items-center justify-center rounded-full hover:bg-brand-100"
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
                    className="min-w-32 flex-1 bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-stone-400"
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
            </form>
          </Card>

          <DuplicatesCard
            restaurantId={restaurantId}
            customer={customer}
            canMerge={role !== "staff"}
            merging={merge.isPending}
            onMerge={async (other) => {
              if (
                await confirm({
                  title: t("customers.duplicates.confirmTitle", { name: other.name }),
                  description: t("customers.duplicates.confirmDescription", {
                    name: customer.name,
                  }),
                  confirmLabel: t("customers.duplicates.merge"),
                  tone: "danger",
                })
              )
                merge.mutate(other.id);
            }}
          />

          {role !== "staff" ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{t("customers.delete")}</p>
                  <p className="text-sm text-stone-500">{t("customers.deleteHint")}</p>
                </div>
                <Button
                  variant="outline"
                  icon={<Trash />}
                  className="text-red-700 hover:bg-red-50"
                  loading={remove.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("customers.confirmDelete"),
                        description: t("customers.deleteHint"),
                        confirmLabel: t("customers.delete"),
                      })
                    )
                      remove.mutate();
                  }}
                >
                  {t("customers.delete")}
                </Button>
              </div>
            </Card>
          ) : null}
        </div>

        <Card title={t("customers.history")} className="lg:col-span-2" flush>
          {history.isLoading ? (
            <PageLoader />
          ) : bookings.length === 0 ? (
            <div className="p-4">
              <EmptyState icon={<ClipboardList />}>{t("customers.noHistory")}</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {bookings.map((b) => {
                const inactive = !ACTIVE.has(b.status);
                return (
                  <li key={b.id}>
                    <Link
                      to="/r/$restaurantId/today"
                      params={{ restaurantId }}
                      search={{ date: b.serviceDate }}
                      className={cn(
                        "block px-5 py-3 transition-colors hover:bg-stone-50",
                        inactive && "bg-stone-50/50",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[15px] font-semibold capitalize">
                          {formatDate(b.serviceDate, i18n.language, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[15px] font-bold tabular-nums">
                          {formatTime(b.startsAt, restaurant.timezone, i18n.language)}
                        </span>
                        <span className="ml-auto">
                          <StatusBadge status={b.status} size="sm" />
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] text-stone-500">
                        {t("today.guests", { count: b.partySize })} · {b.serviceName} ·{" "}
                        {t(`today.source.${b.source}`)}
                      </p>
                      {b.notes ? (
                        <p className="mt-1 flex items-start gap-1 text-[13px] text-amber-900">
                          <StickyNote className="mt-0.5 size-3 shrink-0 text-amber-600" />
                          {b.notes}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Entries that look like the same person, plus a search box to pick any other
 * guest. Managers merge from here; staff only see the hint.
 */
function DuplicatesCard({
  restaurantId,
  customer,
  canMerge,
  merging,
  onMerge,
}: {
  restaurantId: string;
  customer: CustomerDto;
  canMerge: boolean;
  merging: boolean;
  onMerge: (other: CustomerDto) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const term = search.trim();
  const suggested = useQuery(customerDuplicatesQuery(restaurantId, customer.id));
  const found = useQuery({
    ...customersQuery(restaurantId, { search: term }),
    enabled: term.length > 0,
  });
  const candidates: Array<CustomerDto & { matches?: CustomerDuplicateDto["matches"] }> = term
    ? (found.data?.items ?? []).filter((c) => c.id !== customer.id).slice(0, 8)
    : (suggested.data ?? []);
  const loading = term ? found.isLoading : suggested.isLoading;

  return (
    <Card title={t("customers.duplicates.title")} description={t("customers.duplicates.hint")}>
      {canMerge ? (
        <Field label={t("customers.duplicates.search")} className="mb-3">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.duplicates.searchPlaceholder")}
          />
        </Field>
      ) : null}
      {loading ? (
        <PageLoader />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-stone-500">
          {term ? t("customers.duplicates.noResults") : t("customers.duplicates.none")}
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <Link
                  to="/r/$restaurantId/customers/$customerId"
                  params={{ restaurantId, customerId: c.id }}
                  className="block truncate text-[15px] font-semibold text-stone-900 hover:text-brand-700"
                >
                  {c.name}
                </Link>
                <p className="truncate text-[13px] text-stone-500">
                  {[c.email, c.phone, t("customers.visitsShort", { count: c.visitCount })]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {c.matches && c.matches.length > 0 ? (
                  <p className="text-[13px] font-medium text-amber-800">
                    {t("customers.duplicates.inCommon", {
                      what: c.matches.map((m) => t(`customers.duplicates.matched.${m}`)).join(", "),
                    })}
                  </p>
                ) : null}
              </div>
              {canMerge ? (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Merge />}
                  disabled={merging}
                  onClick={() => onMerge(c)}
                >
                  {t("customers.duplicates.merge")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {!canMerge && candidates.length > 0 ? (
        <p className="mt-3 text-sm text-stone-500">{t("customers.duplicates.staffHint")}</p>
      ) : null}
    </Card>
  );
}
