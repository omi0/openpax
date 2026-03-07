import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, FileText, Mail, MessageSquare, Plug } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NotificationRules } from "@/components/notification-rules";
import { NotificationTemplates } from "@/components/notification-templates";
import { ProviderConfigForm } from "@/components/provider-config-form";
import { Badge, Card, Segmented } from "@/components/ui";
import { notificationSettingsQuery, providerConfigQuery, providersQuery } from "@/lib/queries";

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

type Tab = "providers" | "rules" | "templates";

function NotificationsPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("providers");
  const { data: providers } = useSuspenseQuery(providersQuery());
  const { data: email } = useSuspenseQuery(providerConfigQuery(restaurantId, "email"));
  const { data: sms } = useSuspenseQuery(providerConfigQuery(restaurantId, "sms"));
  const { data: settings } = useSuspenseQuery(notificationSettingsQuery(restaurantId));

  const scopeBadge = (scope: string) => (
    <Badge tone={scope === "none" ? "neutral" : "success"}>
      {t(`notifications.scope.${scope}`)}
    </Badge>
  );

  return (
    <div className="space-y-4">
      <Segmented
        ariaLabel={t("notifications.title")}
        value={tab}
        onChange={setTab}
        className="w-full sm:w-auto [&>button]:flex-1"
        options={[
          { value: "providers", label: t("notifications.providers"), icon: <Plug /> },
          { value: "rules", label: t("notifications.rules"), icon: <Bell /> },
          { value: "templates", label: t("notifications.templates"), icon: <FileText /> },
        ]}
      />
      {tab === "providers" ? (
        <>
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <Mail className="size-5 text-brand-700" /> {t("notifications.email")}
              </span>
            }
            description={t("notifications.channelHint.email")}
            actions={scopeBadge(email.scope)}
          >
            <ProviderConfigForm
              key={`email-${email.providerId}-${email.scope}`}
              restaurantId={restaurantId}
              channel="email"
              providers={providers.filter((p) => p.channel === "email")}
              current={email}
            />
          </Card>
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="size-5 text-brand-700" /> {t("notifications.sms")}
              </span>
            }
            description={t("notifications.channelHint.sms")}
            actions={scopeBadge(sms.scope)}
          >
            <ProviderConfigForm
              key={`sms-${sms.providerId}-${sms.scope}`}
              restaurantId={restaurantId}
              channel="sms"
              providers={providers.filter((p) => p.channel === "sms")}
              current={sms}
            />
          </Card>
        </>
      ) : tab === "templates" ? (
        <Card title={t("notifications.templatesTitle")} description={t("templates.hint")}>
          <NotificationTemplates restaurantId={restaurantId} />
        </Card>
      ) : (
        <Card title={t("notifications.rulesTitle")} description={t("notifications.rulesHint")}>
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
