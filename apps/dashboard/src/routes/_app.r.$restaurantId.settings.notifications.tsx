import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NotificationRules } from "@/components/notification-rules";
import { ProviderConfigForm } from "@/components/provider-config-form";
import { Card } from "@/components/ui";
import { notificationSettingsQuery, providerConfigQuery, providersQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/notifications")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(providersQuery()),
      context.queryClient.ensureQueryData(providerConfigQuery(params.restaurantId, "email")),
      context.queryClient.ensureQueryData(providerConfigQuery(params.restaurantId, "sms")),
      context.queryClient.ensureQueryData(notificationSettingsQuery(params.restaurantId)),
    ]);
  },
  component: NotificationsPage,
});

function NotificationsPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const [tab, setTab] = useState<"providers" | "rules">("providers");
  const { data: providers } = useSuspenseQuery(providersQuery());
  const { data: email } = useSuspenseQuery(providerConfigQuery(restaurantId, "email"));
  const { data: sms } = useSuspenseQuery(providerConfigQuery(restaurantId, "sms"));
  const { data: settings } = useSuspenseQuery(notificationSettingsQuery(restaurantId));

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm">
        {(["providers", "rules"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5",
              tab === k ? "bg-white font-medium shadow-sm" : "text-zinc-600",
            )}
          >
            {t(`notifications.${k}`)}
          </button>
        ))}
      </div>
      {tab === "providers" ? (
        <>
          <Card title={t("notifications.email")}>
            <ProviderConfigForm
              key={`email-${email.providerId}-${email.scope}`}
              restaurantId={restaurantId}
              channel="email"
              providers={providers.filter((p) => p.channel === "email")}
              current={email}
            />
          </Card>
          <Card title={t("notifications.sms")}>
            <ProviderConfigForm
              key={`sms-${sms.providerId}-${sms.scope}`}
              restaurantId={restaurantId}
              channel="sms"
              providers={providers.filter((p) => p.channel === "sms")}
              current={sms}
            />
          </Card>
        </>
      ) : (
        <Card title={t("notifications.rules")}>
          <NotificationRules
            key={settings
              .map((s) => `${s.event}${s.channel}${s.audience}${s.enabled}${s.offsetMinutes}`)
              .join()}
            restaurantId={restaurantId}
            settings={settings}
            smsConfigured={sms.scope !== "none"}
          />
        </Card>
      )}
    </div>
  );
}
