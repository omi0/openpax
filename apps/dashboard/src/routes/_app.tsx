import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import {
  CalendarDays,
  CalendarRange,
  ChartColumn,
  Check,
  ChevronsUpDown,
  ClipboardList,
  LogOut,
  Menu as MenuIcon,
  MessageSquareHeart,
  Plus,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandLockup, BrandMark } from "@/components/brand";
import { NewBookingsWatcher } from "@/components/new-bookings-watcher";
import { Avatar, Menu } from "@/components/ui";
import { setLanguage } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { type Me, meQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login", search: { redirect: location.href } });
    await context.queryClient.ensureQueryData(meQuery());
  },
  component: AppLayout,
});

const sections = [
  { to: "/r/$restaurantId/today", key: "app.today", Icon: CalendarDays, mobile: true },
  { to: "/r/$restaurantId/calendar", key: "app.calendar", Icon: CalendarRange, mobile: true },
  { to: "/r/$restaurantId/bookings", key: "app.bookings", Icon: ClipboardList, mobile: true },
  { to: "/r/$restaurantId/customers", key: "app.customers", Icon: Users, mobile: true },
  { to: "/r/$restaurantId/analytics", key: "app.analytics", Icon: ChartColumn, mobile: false },
  { to: "/r/$restaurantId/feedback", key: "app.feedback", Icon: MessageSquareHeart, mobile: false },
  { to: "/r/$restaurantId/settings", key: "app.settings", Icon: Settings, mobile: false },
] as const;

function AppLayout() {
  const { t } = useTranslation();
  const { data: me } = useSuspenseQuery(meQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams({ strict: false }) as { restaurantId?: string };
  const current = me.restaurants.find((r) => r.id === params.restaurantId) ?? null;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const onboarding = pathname.startsWith("/onboarding");
  const setup = /^\/r\/[^/]+\/setup(\/|$)/.test(pathname);

  // close the drawer after any navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const logout = async () => {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  if (onboarding || setup)
    return (
      <MinimalLayout
        me={me}
        current={current}
        exitLabel={setup ? t("setup.later") : t("app.back")}
        onLogout={logout}
      />
    );

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      {/* phone: top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-stone-200 bg-white/95 px-3 backdrop-blur md:hidden print:hidden">
        <button
          type="button"
          aria-label={t("app.menu")}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-stone-100"
        >
          <MenuIcon className="size-5" />
        </button>
        <BrandMark size={30} />
        <span className="min-w-0 truncate text-base font-semibold">
          {current?.name ?? "OpenPax"}
        </span>
      </header>

      {/* phone: drawer with everything */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 animate-fade-in bg-stone-900/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[88vw] animate-slide-in-left flex-col overflow-y-auto bg-white px-4 pt-3 pb-6 shadow-pop">
            <div className="mb-4 flex items-center justify-between">
              <BrandLockup />
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-xl hover:bg-stone-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavContent me={me} current={current} onLogout={logout} />
          </aside>
        </div>
      ) : null}

      {/* desktop: sidebar */}
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-stone-200 bg-white px-4 pt-5 pb-4 md:sticky md:top-0 md:flex md:h-dvh print:hidden">
        <BrandLockup className="mb-5 px-2" />
        <NavContent me={me} current={current} onLogout={logout} />
      </aside>

      {current ? (
        <NewBookingsWatcher
          key={current.id}
          restaurantId={current.id}
          timezone={current.timezone}
        />
      ) : null}

      <main className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* phone: bottom tabs for the daily screens */}
      {current ? (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
        >
          {sections
            .filter((s) => s.mobile)
            .map(({ to, key, Icon }) => (
              <Link
                key={to}
                to={to}
                params={{ restaurantId: current.id }}
                className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-stone-500"
                activeProps={{ className: "text-brand-700" }}
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                        isActive && "bg-brand-50",
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    {t(key)}
                  </>
                )}
              </Link>
            ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-stone-500"
          >
            <span className="inline-flex h-7 w-12 items-center justify-center rounded-full">
              <MenuIcon className="size-5" />
            </span>
            {t("app.more")}
          </button>
        </nav>
      ) : null}
    </div>
  );
}

/** Header-only frame for onboarding and the setup guide, so the sidebar does not distract. */
function MinimalLayout({
  me,
  current,
  exitLabel,
  onLogout,
}: {
  me: Me;
  current: Me["restaurants"][number] | null;
  exitLabel: string;
  onLogout: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const first = current ?? me.restaurants[0];
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-16 items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 md:px-8">
        <BrandMark size={34} className="sm:hidden" />
        <BrandLockup className="hidden sm:flex" />
        <div className="flex items-center gap-1 sm:gap-2">
          <LanguageToggle value={i18n.language} onChange={setLanguage} className="w-32 sm:w-44" />
          {first ? (
            <Link
              to="/r/$restaurantId/today"
              params={{ restaurantId: first.id }}
              className="rounded-xl px-2 py-2 text-sm font-medium whitespace-nowrap text-stone-600 hover:bg-stone-100 sm:px-3"
            >
              {exitLabel}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void onLogout()}
            aria-label={t("app.logout")}
            title={t("app.logout")}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-medium text-stone-600 hover:bg-stone-100 sm:px-3"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{t("app.logout")}</span>
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 py-8 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function NavContent({
  me,
  current,
  onLogout,
}: {
  me: Me;
  current: Me["restaurants"][number] | null;
  onLogout: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RestaurantSwitcher
        me={me}
        current={current}
        onPick={(id) =>
          void navigate({ to: "/r/$restaurantId/today", params: { restaurantId: id } })
        }
      />
      {current ? (
        <nav className="mt-4 space-y-1">
          {sections.map(({ to, key, Icon }) => (
            <Link
              key={to}
              to={to}
              params={{ restaurantId: current.id }}
              className="group flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-stone-700 transition-colors hover:bg-stone-100"
              activeProps={{ className: "bg-brand-50 text-brand-800 hover:bg-brand-50" }}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      "size-5 text-stone-400 group-hover:text-stone-600",
                      isActive && "text-brand-700 group-hover:text-brand-700",
                    )}
                  />
                  {t(key)}
                </>
              )}
            </Link>
          ))}
        </nav>
      ) : null}
      <div className="mt-auto space-y-3 pt-6">
        <LanguageToggle value={i18n.language} onChange={setLanguage} />
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 p-2.5">
          <Avatar name={me.user.name || me.user.email} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.user.name || me.user.email}</p>
            {me.user.name ? (
              <p className="truncate text-xs text-stone-500">{me.user.email}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void onLogout()}
            title={t("app.logout")}
            aria-label={t("app.logout")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function RestaurantSwitcher({
  me,
  current,
  onPick,
}: {
  me: Me;
  current: Me["restaurants"][number] | null;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const items = [
    ...me.restaurants.map((r) => ({
      label: (
        <span className="flex flex-1 items-center justify-between gap-2">
          <span className="truncate">{r.name}</span>
          {r.id === current?.id ? <Check className="size-4 text-brand-700" /> : null}
        </span>
      ),
      onSelect: () => onPick(r.id),
    })),
    "separator" as const,
    {
      label: t("app.newRestaurant"),
      icon: <Plus />,
      onSelect: () => void navigate({ to: "/onboarding" }),
    },
  ];
  return (
    <Menu
      align="start"
      className="w-full"
      items={items}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={t("app.switchRestaurant")}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-left transition-colors hover:bg-stone-100",
            open && "bg-stone-100",
          )}
        >
          <Avatar name={current?.name ?? "?"} size="sm" className="rounded-lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {current?.name ?? t("app.restaurants")}
            </span>
            <span className="block truncate text-xs text-stone-500">
              {current ? t(`role.${current.role}`) : t("app.newRestaurant")}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-stone-400" />
        </button>
      )}
    />
  );
}

function LanguageToggle({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (l: "it" | "en") => void;
  className?: string;
}) {
  return (
    <fieldset
      className={cn("grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1", className)}
      aria-label="Language"
    >
      {(["it", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={value.startsWith(l)}
          onClick={() => onChange(l)}
          className={cn(
            "h-8 rounded-lg text-sm font-medium transition-colors",
            value.startsWith(l) ? "bg-white text-stone-900 shadow-sm" : "text-stone-500",
          )}
        >
          {l === "it" ? "Italiano" : "English"}
        </button>
      ))}
    </fieldset>
  );
}
