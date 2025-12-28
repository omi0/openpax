import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { meQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const tabs = [
    { to: "/r/$restaurantId/settings/services", label: t("services.title") },
    { to: "/r/$restaurantId/settings/closures", label: t("closures.title") },
    { to: "/r/$restaurantId/settings/notifications", label: t("notifications.title") },
    { to: "/r/$restaurantId/settings/widget", label: t("widget.title") },
    { to: "/r/$restaurantId/settings/team", label: t("team.title") },
    ...(role !== "staff"
      ? [{ to: "/r/$restaurantId/settings/api-keys", label: t("apiKeys.title") }]
      : []),
  ] as const;
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("app.settings")}</h1>
      <nav className="mb-6 flex gap-1 border-b border-zinc-200">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ restaurantId }}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-zinc-600 hover:text-zinc-900"
            activeProps={{ className: "border-brand font-medium text-brand" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
