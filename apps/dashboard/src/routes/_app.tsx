import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { CalendarDays, LogOut, Plus, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { authClient } from "@/lib/auth-client";
import { meQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login", search: { redirect: location.href } });
    await context.queryClient.ensureQueryData(meQuery());
  },
  component: AppLayout,
});

function AppLayout() {
  const { t, i18n } = useTranslation();
  const { data: me } = useSuspenseQuery(meQuery());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams({ strict: false }) as { restaurantId?: string };
  const current = me.restaurants.find((r) => r.id === params.restaurantId) ?? null;

  const logout = async () => {
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand font-bold text-white">
            S
          </span>
          <span className="font-semibold">Sitli</span>
        </div>
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
              <Link
                to="/r/$restaurantId/today"
                params={{ restaurantId: current.id }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100"
                activeProps={{ className: "bg-zinc-100 font-medium" }}
              >
                <CalendarDays className="size-4" /> {t("app.today")}
              </Link>
              <Link
                to="/r/$restaurantId/settings"
                params={{ restaurantId: current.id }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-100"
                activeProps={{ className: "bg-zinc-100 font-medium" }}
              >
                <Settings className="size-4" /> {t("app.settings")}
              </Link>
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
            onClick={() => void logout()}
            className="flex items-center gap-2 text-zinc-600 hover:text-zinc-900"
          >
            <LogOut className="size-4" /> {t("app.logout")}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
