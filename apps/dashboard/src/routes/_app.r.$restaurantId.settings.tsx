import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/r/$restaurantId/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const tabs = [
    { to: "/r/$restaurantId/settings/services", label: t("services.title") },
    { to: "/r/$restaurantId/settings/notifications", label: t("notifications.title") },
    { to: "/r/$restaurantId/settings/widget", label: t("widget.title") },
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
