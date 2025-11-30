import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { restaurantQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(restaurantQuery(params.restaurantId)),
  component: RestaurantLayout,
});

function RestaurantLayout() {
  const { restaurantId } = Route.useParams();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  return (
    <div>
      <p className="mb-1 text-sm text-zinc-500 md:hidden">{restaurant.name}</p>
      <Outlet />
    </div>
  );
}
