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
  ClipboardList,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  { to: "/r/$restaurantId/today", key: "app.today", Icon: CalendarDays },
  { to: "/r/$restaurantId/calendar", key: "app.calendar", Icon: CalendarRange },
  { to: "/r/$restaurantId/bookings", key: "app.bookings", Icon: ClipboardList },
  { to: "/r/$restaurantId/customers", key: "app.customers", Icon: Users },
  { to: "/r/$restaurantId/settings", key: "app.settings", Icon: Settings },
] as const;

function AppLayout() {
  const { data: me } = useSuspenseQuery(meQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams({ strict: false }) as { restaurantId?: string };
  const current = me.restaurants.find((r) => r.id === params.restaurantId) ?? null;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  // close the drawer after any navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const logout = async () => {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 md:hidden">
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 hover:bg-zinc-100"
        >
          <Menu className="size-5" />
        </button>
        <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm font-bold text-white">
          S
        </span>
        <span className="truncate font-semibold">{current?.name ?? "Sitli"}</span>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">Sitli</span>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 hover:bg-zinc-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <NavContent me={me} current={current} onLogout={logout} />
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand font-bold text-white">
            S
          </span>
          <span className="font-semibold">Sitli</span>
        </div>
        <NavContent me={me} current={current} onLogout={logout} />
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <Outlet />
        </div>
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
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {t("app.restaurants")}
      </p>
      <nav className="space-y-0.5">
        {me.restaurants.map((r) => (
          <Link
            key={r.id}
            to="/r/$restaurantId/today"
            params={{ restaurantId: r.id }}
            className={cn(
              "block truncate rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100",
              r.id === current?.id && "bg-brand-50 font-medium text-brand",
            )}
          >
            {r.name}
          </Link>
        ))}
        <Link
          to="/onboarding"
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100"
        >
          <Plus className="size-4" /> {t("app.newRestaurant")}
        </Link>
      </nav>
      {current ? (
        <>
          <p className="mt-6 mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            {current.name}
          </p>
          <nav className="space-y-0.5">
            {sections.map(({ to, key, Icon }) => (
              <Link
                key={to}
                to={to}
                params={{ restaurantId: current.id }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100"
                activeProps={{ className: "bg-zinc-100 font-medium" }}
              >
                <Icon className="size-4" /> {t(key)}
              </Link>
            ))}
          </nav>
        </>
      ) : null}
      <div className="mt-auto space-y-2 px-2 pt-6 text-sm">
        <div className="flex gap-1">
          {(["it", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              className={cn(
                "rounded px-2 py-0.5 text-xs uppercase",
                i18n.language.startsWith(l)
                  ? "bg-zinc-200 font-semibold"
                  : "text-zinc-500 hover:bg-zinc-100",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <p className="truncate text-zinc-500">{me.user.email}</p>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900"
        >
          <LogOut className="size-4" /> {t("app.logout")}
        </button>
      </div>
    </div>
  );
}
