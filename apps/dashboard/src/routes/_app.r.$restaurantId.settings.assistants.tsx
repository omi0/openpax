import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Card, EmptyState, useConfirm, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { assistantsQuery, restaurantQuery } from "@/lib/queries";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/assistants")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(assistantsQuery()),
      context.queryClient.ensureQueryData(restaurantQuery(params.restaurantId)),
    ]),
  component: AssistantsPage,
});

/**
 * Settings → Assistants: the address to paste into Claude / ChatGPT, how to
 * do it, what to ask, and the connections of the signed-in user.
 */
function AssistantsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: status } = useSuspenseQuery(assistantsQuery());
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [error, setError] = useState<string | null>(null);

  const disconnect = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assistants/connections/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assistants"] });
      toast.success(t("app.saved"));
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(t("app.copied"));
  };
  const fmt = (iso: string) => formatDateTime(iso, restaurant.timezone, i18n.language);
  const examples = t("assistants.ask", { returnObjects: true }) as string[];

  return (
    <div className="space-y-4">
      <Alert tone="info">{t("assistants.intro")}</Alert>
      {!status.enabled ? <Alert tone="warning">{t("assistants.disabled")}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}

      {status.url ? (
        <Card title={t("assistants.urlTitle")} description={t("assistants.urlHint")}>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-[15px] break-all">
              {status.url}
            </code>
            <Button variant="secondary" icon={<Copy />} onClick={() => void copy(status.url ?? "")}>
              {t("app.copy")}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card title={t("assistants.howTitle")}>
        <ol className="space-y-3 text-[15px] text-stone-700">
          <li className="flex gap-3">
            <span className="w-32 shrink-0 font-semibold text-stone-900">Claude</span>
            <span>{t("assistants.how.claude")}</span>
          </li>
          <li className="flex gap-3">
            <span className="w-32 shrink-0 font-semibold text-stone-900">ChatGPT</span>
            <span>{t("assistants.how.chatgpt")}</span>
          </li>
          <li className="flex gap-3">
            <span className="w-32 shrink-0 font-semibold text-stone-900">
              {t("assistants.otherApps")}
            </span>
            <span>{t("assistants.how.other")}</span>
          </li>
        </ol>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <MessageCircleQuestion className="size-5 text-brand-700" /> {t("assistants.askTitle")}
          </span>
        }
      >
        <ul className="flex flex-wrap gap-2">
          {examples.map((q) => (
            <li
              key={q}
              className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm text-stone-700"
            >
              “{q}”
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-5 text-brand-700" /> {t("assistants.connectionsTitle")}
          </span>
        }
        description={t("assistants.connectionsHint")}
        flush={status.connections.length > 0}
      >
        {status.connections.length === 0 ? (
          <EmptyState icon={<Sparkles />}>{t("assistants.empty")}</EmptyState>
        ) : (
          <ul className="divide-y divide-stone-100">
            {status.connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <Sparkles className="size-5" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    {c.clientName ?? t("assistants.unknownClient")}
                    <Badge tone={c.canWrite ? "brand" : "neutral"} size="sm">
                      {c.canWrite ? t("assistants.canWrite") : t("assistants.readOnly")}
                    </Badge>
                  </p>
                  <p className="text-sm text-stone-500">
                    {t("assistants.connectedOn", { date: fmt(c.createdAt) })}
                    {c.clientUri ? ` · ${c.clientUri}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-700"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("assistants.confirmDisconnect"),
                        confirmLabel: t("assistants.disconnect"),
                      })
                    )
                      disconnect.mutate(c.id);
                  }}
                >
                  {t("assistants.disconnect")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
