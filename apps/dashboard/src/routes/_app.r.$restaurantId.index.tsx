import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/r/$restaurantId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/r/$restaurantId/today", params });
  },
});
