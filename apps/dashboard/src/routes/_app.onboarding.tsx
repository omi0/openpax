import type { RestaurantDto } from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { SetupShell } from "@/components/setup-shell";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { TIMEZONES } from "@/lib/timezones";

export const Route = createFileRoute("/_app/onboarding")({ component: OnboardingPage });

/**
 * First step of the setup guide, before a restaurant exists: create it, then
 * hand over to the guide at `/r/:id/setup`, which walks through the rest.
 */
function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formId = useId();
  const [error, setError] = useState<string | null>(null);

  const createRestaurant = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<RestaurantDto>("/api/v1/restaurants", body),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      window.scrollTo({ top: 0 });
      await navigate({
        to: "/r/$restaurantId/setup",
        params: { restaurantId: r.id },
        search: { step: "services" },
      });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: f.get("name"),
      seats: Number(f.get("seats")),
      timezone: f.get("timezone"),
      locale: f.get("locale"),
    };
    for (const k of ["email", "phone", "address"]) if (f.get(k)) body[k] = f.get(k);
    setError(null);
    createRestaurant.mutate(body);
  };

  return (
    <SetupShell
      current="restaurant"
      status={null}
      restaurantId={null}
      title={t("onboarding.title")}
      footer={
        <div className="ml-auto">
          <Button type="submit" form={formId} size="lg" loading={createRestaurant.isPending}>
            {t("onboarding.continue")} <ArrowRight className="size-[18px]" />
          </Button>
        </div>
      }
    >
      {error ? <Alert>{error}</Alert> : null}
      <Card title={t("onboarding.welcome")} description={t("onboarding.subtitle")}>
        <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("onboarding.name")} className="sm:col-span-2" required>
            <Input name="name" required maxLength={120} autoFocus />
          </Field>
          <Field
            label={t("onboarding.seats")}
            hint={t("onboarding.seatsHint")}
            className="sm:col-span-2"
            required
          >
            <Input name="seats" type="number" inputMode="numeric" min={1} max={5000} required />
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
          <Field label={t("onboarding.email")} hint={t("onboarding.emailHint")}>
            <Input name="email" type="email" />
          </Field>
          <Field label={t("onboarding.phone")}>
            <Input name="phone" type="tel" />
          </Field>
          <Field label={t("onboarding.address")} className="sm:col-span-2">
            <Input name="address" />
          </Field>
        </form>
      </Card>
    </SetupShell>
  );
}
