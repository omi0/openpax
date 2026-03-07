import type { RestaurantDto, UpsertServiceInput } from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { defaultServiceInput, ServiceForm } from "@/components/service-form";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { TIMEZONES } from "@/lib/timezones";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/onboarding")({ component: OnboardingPage });

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
      window.scrollTo({ top: 0 });
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

  const step = restaurant ? 2 : 1;
  const steps = [t("onboarding.step1"), t("onboarding.step2")];

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-medium text-brand-700">{t("onboarding.welcome")}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{t("onboarding.title")}</h1>
      <p className="mt-2 text-[15px] text-stone-500">{t("onboarding.subtitle")}</p>

      <ol className="my-6 flex items-center gap-3">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full text-sm font-bold",
                  done && "bg-brand-600 text-white",
                  active && "bg-brand-600 text-white ring-4 ring-brand-100",
                  !done && !active && "bg-stone-200 text-stone-600",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  "text-[15px] font-medium",
                  active ? "text-stone-900" : "text-stone-500",
                )}
              >
                {label}
              </span>
              {i < steps.length - 1 ? <span className="mx-1 h-px w-8 bg-stone-300" /> : null}
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {!restaurant ? (
        <Card>
          <form onSubmit={submitRestaurant} className="grid gap-4 sm:grid-cols-2">
            <Field label={t("onboarding.name")} className="sm:col-span-2" required>
              <Input name="name" required maxLength={120} autoFocus />
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
              <Button type="submit" size="lg" loading={createRestaurant.isPending}>
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
