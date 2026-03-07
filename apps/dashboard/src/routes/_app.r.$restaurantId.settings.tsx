import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { meQuery } from "@/lib/queries";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/lib/settings-nav";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const { data: me } = useSuspenseQuery(meQuery());
  const role = me.restaurants.find((r) => r.id === restaurantId)?.role ?? "staff";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const sections = SETTINGS_SECTIONS.filter((s) => !s.managersOnly || role !== "staff");
  const atHub = /\/settings\/?$/.test(pathname);
  const current = sections.find((s) => pathname.includes(s.to.replace("/r/$restaurantId", "")));

  if (atHub) return <Outlet />;

  return (
    <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      <aside className="mb-5 lg:mb-0">
        <Link
          to="/r/$restaurantId/settings"
          params={{ restaurantId }}
          className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-sm font-medium text-stone-600 hover:text-stone-900"
        >
          <ArrowLeft className="size-4" /> {t("settings.back")}
        </Link>
        <nav className="hidden space-y-0.5 lg:block">
          {sections.map((s) => (
            <SectionLink key={s.to} section={s} restaurantId={restaurantId} />
          ))}
        </nav>
        {/* phones: show where we are, with a quick way to the other sections */}
        <div className="lg:hidden">
          {current ? (
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <current.Icon className="size-6 text-brand-700" /> {t(current.titleKey)}
            </h1>
          ) : null}
          <div className="scroll-thin -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {sections.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                params={{ restaurantId }}
                className="shrink-0 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 data-[status=active]:border-brand-600 data-[status=active]:bg-brand-600 data-[status=active]:text-white"
              >
                {t(s.titleKey)}
              </Link>
            ))}
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        {current ? (
          <h1 className="mb-4 hidden text-2xl font-bold tracking-tight lg:block">
            {t(current.titleKey)}
          </h1>
        ) : null}
        <Outlet />
      </div>
    </div>
  );
}

function SectionLink({
  section,
  restaurantId,
}: {
  section: SettingsSection;
  restaurantId: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Link
      to={section.to}
      params={{ restaurantId }}
      aria-labelledby={id}
      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-stone-700 hover:bg-stone-100"
      activeProps={{ className: "bg-brand-50 text-brand-800 hover:bg-brand-50" }}
    >
      {({ isActive }) => (
        <>
          <section.Icon
            className={cn(
              "size-5 shrink-0 text-stone-400 group-hover:text-stone-600",
              isActive && "text-brand-700 group-hover:text-brand-700",
            )}
          />
          <span id={id}>{t(section.titleKey)}</span>
        </>
      )}
    </Link>
  );
}
