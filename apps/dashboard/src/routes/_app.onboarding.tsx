import type { RestaurantDto, UpsertServiceInput } from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { defaultServiceInput, ServiceForm } from "@/components/service-form";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";

export const Route = createFileRoute("/_app/onboarding")({ component: OnboardingPage });

const TIMEZONES = [
  "Europe/Rome",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Amsterdam",
  "Europe/Athens",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const starterService = (): UpsertServiceInput => ({
  ...defaultServiceInput(),
  name: "Cena",
  weeklyHours: {
    mon: [],
    tue: [{ start: "19:00", end: "22:00" }],
    wed: [{ start: "19:00", end: "22:00" }],
    thu: [{ start: "19:00", end: "22:00" }],
    fri: [{ start: "19:00", end: "22:30" }],
    sat: [{ start: "19:00", end: "22:30" }],
    sun: [{ start: "19:00", end: "22:00" }],
  },
  maxCoversPerSlot: 20,
});

function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [restaurant, setRestaurant] = useState<RestaurantDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createRestaurant = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<RestaurantDto>("/api/v1/restaurants", body),
    onSuccess: async (r) => {
      setRestaurant(r);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const createService = useMutation({
    mutationFn: (body: UpsertServiceInput) =>
      api.post(`/api/v1/restaurants/${restaurant?.id}/services`, body),
    onSuccess: async () => {
      if (restaurant)
        await navigate({
          to: "/r/$restaurantId/settings/widget",
          params: { restaurantId: restaurant.id },
        });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submitRestaurant = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: f.get("name"),
      timezone: f.get("timezone"),
      locale: f.get("locale"),
    };
    for (const k of ["email", "phone", "address"]) if (f.get(k)) body[k] = f.get(k);
    setError(null);
    createRestaurant.mutate(body);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">{t("onboarding.title")}</h1>
      <p className="mt-1 text-zinc-500">{t("onboarding.subtitle")}</p>
      <ol className="my-6 flex gap-4 text-sm">
        <li className={restaurant ? "text-zinc-400" : "font-semibold text-brand"}>
          1. {t("onboarding.step1")}
        </li>
        <li className={restaurant ? "font-semibold text-brand" : "text-zinc-400"}>
          2. {t("onboarding.step2")}
        </li>
      </ol>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {!restaurant ? (
        <Card>
          <form onSubmit={submitRestaurant} className="grid gap-4 sm:grid-cols-2">
            <Field label={t("onboarding.name")} className="sm:col-span-2">
              <Input name="name" required maxLength={120} />
            </Field>
            <Field label={t("onboarding.timezone")}>
              <Select name="timezone" defaultValue="Europe/Rome">
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("onboarding.locale")}>
              <Select name="locale" defaultValue="it">
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label={t("onboarding.email")}>
              <Input name="email" type="email" />
            </Field>
            <Field label={t("onboarding.phone")}>
              <Input name="phone" type="tel" />
            </Field>
            <Field label={t("onboarding.address")} className="sm:col-span-2">
              <Input name="address" />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={createRestaurant.isPending}>
                {t("onboarding.continue")}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card title={t("onboarding.step2")} description={t("onboarding.serviceIntro")}>
          <ServiceForm
            initial={starterService()}
            onSubmit={(v) => createService.mutate(v)}
            busy={createService.isPending}
            submitLabel={t("onboarding.finish")}
          />
        </Card>
      )}
    </div>
  );
}
