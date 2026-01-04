import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/r/$restaurantId/settings/restaurant", params });
  },
});
