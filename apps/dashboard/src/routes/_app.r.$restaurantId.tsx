import { createFileRoute, Outlet } from "@tanstack/react-router";
import { restaurantQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(restaurantQuery(params.restaurantId)),
  component: Outlet,
});
