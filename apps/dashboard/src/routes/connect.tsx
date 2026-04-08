import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthLayout } from "@/components/auth-layout";
import { Alert, Button, Checkbox } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { continueOAuth } from "@/lib/auth-search";
import { meQuery } from "@/lib/queries";

/**
 * The consent step of an assistant connection (OAuth). The authorization
 * server sends the browser here with a signed query; the page shows who is
 * asking, what they get, and posts the answer back. The signed query travels
 * with the request, so nothing else has to be remembered.
 */
export const Route = createFileRoute("/connect")({
  validateSearch: (search: Record<string, unknown>) => ({
    client_id: typeof search.client_id === "string" ? search.client_id : undefined,
    scope: typeof search.scope === "string" ? search.scope : undefined,
  }),
  beforeLoad: async ({ context, location }) => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login", search: { redirect: location.href } });
    await context.queryClient.ensureQueryData(meQuery());
  },
  component: ConnectPage,
});

function ConnectPage() {
  const { t } = useTranslation();
  const { client_id: clientId, scope } = Route.useSearch();
  const { data: me } = useSuspenseQuery(meQuery());
  // captured once: the answer must carry exactly the query the server signed
  const [oauthQuery] = useState(() => window.location.search.slice(1));
  const requested = (scope ?? "").split(" ").filter(Boolean);
  const [allowWrite, setAllowWrite] = useState(requested.includes("write"));
  const [busy, setBusy] = useState<"allow" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const client = useQuery({
    queryKey: ["oauth-client", clientId],
    queryFn: async () => {
      const res = await authClient.oauth2.publicClient({ query: { client_id: clientId ?? "" } });
      if (res.error) throw new Error(res.error.message ?? "client not found");
      return res.data;
    },
    enabled: !!clientId,
    retry: false,
  });

  const answer = async (accept: boolean) => {
    setBusy(accept ? "allow" : "deny");
    setError(null);
    const granted = allowWrite ? requested : requested.filter((s) => s !== "write");
    const res = await authClient.oauth2.consent({
      accept,
      ...(accept && granted.length ? { scope: granted.join(" ") } : {}),
      oauth_query: oauthQuery,
    });
    // the auth client follows the redirect in the answer (to the assistant's callback)
    if (res.error || !continueOAuth(res.data)) {
      setBusy(null);
      setError(t("connect.failed"));
    }
  };

  const switchAccount = async () => {
    await authClient.signOut();
    window.location.assign(
      `/login?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`,
    );
  };

  if (!clientId || !oauthQuery.includes("sig="))
    return (
      <AuthLayout title={t("connect.title")}>
        <Alert>{t("connect.invalid")}</Alert>
      </AuthLayout>
    );

  const clientName = client.data?.client_name || t("connect.unknownClient");

  return (
    <AuthLayout
      title={t("connect.title")}
      subtitle={
        client.isPending
          ? t("connect.loading")
          : t("connect.subtitle", { client: clientName, email: me.user.email })
      }
      footer={
        <>
          {t("connect.notYou")}{" "}
          <button
            type="button"
            onClick={() => void switchAccount()}
            className="font-semibold text-brand-700 hover:underline"
          >
            {t("connect.switchAccount")}
          </button>
        </>
      }
    >
      {client.isError ? <Alert className="mb-4">{t("connect.invalid")}</Alert> : null}
      <div className="flex items-start gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-stone-900">{clientName}</p>
          {client.data?.client_uri ? (
            <p className="truncate text-sm text-stone-500">{client.data.client_uri}</p>
          ) : null}
        </div>
      </div>
      <p className="mt-5 text-[15px] text-stone-700">{t("connect.canRead")}</p>
      {me.restaurants.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">{t("connect.noRestaurant")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {me.restaurants.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-[15px]">
              <span className="font-medium text-stone-900">{r.name}</span>
              <span className="text-sm text-stone-500">{t(`role.${r.role}`)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <Checkbox
          label={t("connect.writeLabel")}
          description={t("connect.writeHint")}
          checked={allowWrite}
          onChange={(e) => setAllowWrite(e.currentTarget.checked)}
        />
      </div>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => void answer(false)}
          loading={busy === "deny"}
          disabled={busy !== null}
        >
          {t("connect.deny")}
        </Button>
        <Button
          size="lg"
          onClick={() => void answer(true)}
          loading={busy === "allow"}
          disabled={busy !== null || client.isError}
        >
          {t("connect.allow")}
        </Button>
      </div>
    </AuthLayout>
  );
}
