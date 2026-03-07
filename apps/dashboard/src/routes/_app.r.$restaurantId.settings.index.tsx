import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui";
import { meQuery } from "@/lib/queries";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/lib/settings-nav";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/")({
  component: SettingsHub,
});

/** The settings home: one card per area, in plain words, so staff know where to look. */
function SettingsHub() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const sections = SETTINGS_SECTIONS.filter((s) => !s.managersOnly || role !== "staff");
  return (
    <div>
      <PageHeader title={t("app.settings")} description={t("settings.intro")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <HubCard key={s.to} section={s} restaurantId={restaurantId} />
        ))}
      </div>
    </div>
  );
}

function HubCard({ section, restaurantId }: { section: SettingsSection; restaurantId: string }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Link
      to={section.to}
      params={{ restaurantId }}
      aria-labelledby={id}
      className="group flex items-start gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-card transition hover:border-brand-300 hover:shadow-pop"
    >
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
        <section.Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span id={id} className="block text-base font-semibold text-stone-900">
          {t(section.titleKey)}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-stone-500">
          {t(section.descKey)}
        </span>
      </span>
      <ChevronRight className="mt-3 size-5 shrink-0 text-stone-300 transition group-hover:text-brand-600" />
    </Link>
  );
}
