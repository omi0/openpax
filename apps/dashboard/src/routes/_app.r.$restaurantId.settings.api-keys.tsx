import type { CreatedApiKeyDto } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { apiKeysQuery, restaurantQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

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
  const { data: keys } = useSuspenseQuery(apiKeysQuery(restaurantId));
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [created, setCreated] = useState<CreatedApiKeyDto | null>(null);
  const [copied, setCopied] = useState(false);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const fmt = (iso: string) => formatDateTime(iso, restaurant.timezone, i18n.language);
  const origin = window.location.origin;

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      {created ? (
        <Alert tone="success">
          <p className="font-medium">{t("apiKeys.createdTitle")}</p>
          <p className="text-xs">{t("apiKeys.createdHint")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-sm break-all">
              {created.key}
            </code>
            <Button size="sm" variant="secondary" onClick={() => void copy(created.key)}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t("app.copied") : t("app.copy")}
            </Button>
          </div>
        </Alert>
      ) : null}

      <Card title={t("apiKeys.title")} description={t("apiKeys.hint")}>
        {keys.length === 0 ? (
          <EmptyState>{t("apiKeys.empty")}</EmptyState>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {k.name ?? "—"}{" "}
                    <span className="font-mono text-xs text-zinc-500">{k.start}…</span>
                    {!k.enabled ? <Badge tone="cancelled">off</Badge> : null}
                  </p>
                  <p className="text-xs text-zinc-500">
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
                  onClick={() => {
                    if (window.confirm(t("apiKeys.confirmRevoke"))) revoke.mutate(k.id);
                  }}
                >
                  {t("apiKeys.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={submit}
          className="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-4"
        >
          <Field label={t("apiKeys.name")} className="min-w-52 flex-1">
            <Input name="name" required maxLength={60} placeholder={t("apiKeys.namePlaceholder")} />
          </Field>
          <Field label={t("apiKeys.expiry")}>
            <Select name="expiry" defaultValue="">
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

      <Card title={t("apiKeys.usage")}>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
          {`curl -H "X-Api-Key: sitli_..." \\
  "${origin}/api/v1/restaurants/${restaurantId}/bookings?date=$(date +%F)"`}
        </pre>
        <a
          href={`${origin}/api/openapi.json`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block text-sm text-brand hover:underline"
        >
          {t("apiKeys.docs")}
        </a>
      </Card>
    </div>
  );
}
