import { createFileRoute, redirect } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { meQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login" });
    const me = await context.queryClient.ensureQueryData(meQuery());
    const first = me.restaurants[0];
    if (!first) throw redirect({ to: "/onboarding" });
    throw redirect({ to: "/r/$restaurantId/today", params: { restaurantId: first.id } });
  },
});
