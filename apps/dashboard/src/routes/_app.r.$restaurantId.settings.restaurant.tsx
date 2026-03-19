import type { RestaurantDto, UpdateRestaurantInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { RestaurantProfileForm } from "@/components/restaurant-profile-form";
import { Button, Card, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { restaurantQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/restaurant")({
  component: RestaurantSettingsPage,
});

function RestaurantSettingsPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const formId = useId();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: UpdateRestaurantInput) =>
      api.patch<RestaurantDto>(`/api/v1/restaurants/${restaurantId}`, body),
    onSuccess: async () => {
      toast.success(t("app.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  return (
    <Card
      title={t("restaurant.profile")}
      description={t("restaurant.profileHint")}
      footer={
        <Button type="submit" form={formId} loading={save.isPending}>
          {t("app.save")}
        </Button>
      }
    >
      {/* remount on every saved version so the fields show what is stored */}
      <RestaurantProfileForm
        key={restaurant.updatedAt}
        restaurant={restaurant}
        id={formId}
        error={error}
        onSubmit={(body) => {
          setError(null);
          save.mutate(body);
        }}
      />
    </Card>
  );
}
