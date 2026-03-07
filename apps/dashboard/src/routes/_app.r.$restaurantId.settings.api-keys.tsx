import type { CreatedApiKeyDto } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Copy, KeyRound, Terminal } from "lucide-react";
import { type FormEvent, useState } from "react";
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
  useConfirm,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { apiKeysQuery, restaurantQuery } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/api-keys")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(apiKeysQuery(params.restaurantId)),
  component: ApiKeysPage,
});

const EXPIRIES = [null, 30, 90, 365] as const;

function ApiKeysPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: keys } = useSuspenseQuery(apiKeysQuery(restaurantId));
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "api-keys"] });

  const create = useMutation({
    mutationFn: (body: { name: string; expiresInDays: number | null }) =>
      api.post<CreatedApiKeyDto>(`/api/v1/restaurants/${restaurantId}/api-keys`, body),
    onSuccess: async (key) => {
      setCreated(key);
      await invalidate();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/api-keys/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const expiry = String(f.get("expiry"));
    setError(null);
    setCreated(null);
    create.mutate(
      { name: String(f.get("name")), expiresInDays: expiry ? Number(expiry) : null },
      { onSuccess: () => e.currentTarget?.reset?.() },
    );
  };
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(t("app.copied"));
  };
  const fmt = (iso: string) => formatDateTime(iso, restaurant.timezone, i18n.language);
  const origin = window.location.origin;

  return (
    <div className="space-y-4">
      <Alert tone="info">{t("apiKeys.hint")}</Alert>
      {error ? <Alert>{error}</Alert> : null}
      {created ? (
        <Alert tone="success" title={t("apiKeys.createdTitle")}>
          <p>{t("apiKeys.createdHint")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 font-mono text-sm break-all">
              {created.key}
            </code>
            <Button
              size="sm"
              variant="secondary"
              icon={<Copy />}
              onClick={() => void copy(created.key)}
            >
              {t("app.copy")}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <KeyRound className="size-5 text-brand-700" /> {t("apiKeys.keysTitle")}
          </span>
        }
        flush={keys.length > 0}
      >
        {keys.length === 0 ? (
          <EmptyState icon={<KeyRound />}>{t("apiKeys.empty")}</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span
                  className={cn(
                    "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                    k.enabled ? "bg-brand-50 text-brand-700" : "bg-stone-100 text-stone-400",
                  )}
                >
                  <KeyRound className="size-5" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    {k.name ?? "—"}
                    <span className="font-mono text-xs font-normal text-stone-500">{k.start}…</span>
                    {!k.enabled ? (
                      <Badge tone="danger" size="sm">
                        {t("tables.inactive")}
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-sm text-stone-500">
                    {fmt(k.createdAt)} ·{" "}
                    {k.lastUsedAt
                      ? t("apiKeys.lastUsed", { date: fmt(k.lastUsedAt) })
                      : t("apiKeys.neverUsed")}{" "}
                    · {t("apiKeys.requests", { count: k.requestCount })}
                    {k.expiresAt ? ` · ${t("apiKeys.expiresOn", { date: fmt(k.expiresAt) })}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("apiKeys.confirmRevoke"),
                        confirmLabel: t("apiKeys.revoke"),
                      })
                    )
                      revoke.mutate(k.id);
                  }}
                >
                  {t("apiKeys.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("apiKeys.newKey")}>
        <form
          onSubmit={submit}
          className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
        >
          <Field label={t("apiKeys.name")}>
            <Input name="name" required maxLength={60} placeholder={t("apiKeys.namePlaceholder")} />
          </Field>
          <Field label={t("apiKeys.expiry")}>
            <Select name="expiry" defaultValue="" wrapperClassName="sm:w-40">
              {EXPIRIES.map((d) => (
                <option key={d ?? "never"} value={d ?? ""}>
                  {d ? t("apiKeys.days", { count: d }) : t("apiKeys.never")}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={create.isPending}>
            {t("apiKeys.create")}
          </Button>
        </form>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Terminal className="size-5 text-brand-700" /> {t("apiKeys.usage")}
          </span>
        }
        description={t("apiKeys.usageHint")}
        footer={
          <a
            href={`${origin}/api/openapi.json`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <BookOpen className="size-4" /> {t("apiKeys.docs")}
          </a>
        }
      >
        <pre className="overflow-x-auto rounded-xl bg-stone-900 px-4 py-3.5 text-[13px] leading-relaxed text-stone-100">
          {`curl -H "X-Api-Key: sitli_..." \\
  "${origin}/api/v1/restaurants/${restaurantId}/bookings?date=$(date +%F)"`}
        </pre>
      </Card>
    </div>
  );
}
