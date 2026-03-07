import type { RestaurantDto, UpdateRestaurantInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Field, Input, Select, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { restaurantQuery } from "@/lib/queries";
import { TIMEZONES } from "@/lib/timezones";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/restaurant")({
  component: RestaurantSettingsPage,
});

const toInput = (r: RestaurantDto): UpdateRestaurantInput => ({
  name: r.name,
  timezone: r.timezone,
  locale: r.locale,
  currency: r.currency,
  address: r.address ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
});

function RestaurantSettingsPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const formId = useId();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [form, setForm] = useState<UpdateRestaurantInput>(() => toInput(restaurant));
  const [error, setError] = useState<string | null>(null);
  const timezones = TIMEZONES.includes(restaurant.timezone)
    ? TIMEZONES
    : [restaurant.timezone, ...TIMEZONES];

  const save = useMutation({
    mutationFn: (body: UpdateRestaurantInput) =>
      api.patch<RestaurantDto>(`/api/v1/restaurants/${restaurantId}`, body),
    onSuccess: async (r) => {
      setForm(toInput(r));
      toast.success(t("app.saved"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    // empty optional fields are sent as empty strings, which the API stores as-is;
    // strip them so the columns become null instead
    const body: UpdateRestaurantInput = { ...form };
    for (const key of ["address", "phone", "email"] as const)
      if (!body[key]?.trim()) delete body[key];
    save.mutate(body);
  };

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
      <form id={formId} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t("restaurant.name")} className="sm:col-span-2" required>
          <Input
            value={form.name ?? ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={120}
          />
        </Field>
        <Field
          label={t("restaurant.slug")}
          hint={t("restaurant.slugHint")}
          className="sm:col-span-2"
        >
          <Input
            value={`/book/${restaurant.slug}`}
            readOnly
            className="bg-stone-50 font-mono text-stone-600"
          />
        </Field>
        <Field label={t("restaurant.timezone")}>
          <Select
            value={form.timezone ?? restaurant.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("restaurant.locale")}>
          <Select
            value={form.locale ?? restaurant.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value as "it" | "en" })}
          >
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label={t("restaurant.currency")}>
          <Input
            value={form.currency ?? ""}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            maxLength={3}
            minLength={3}
            pattern="[A-Za-z]{3}"
            className="uppercase"
          />
        </Field>
        <Field label={t("restaurant.phone")}>
          <Input
            type="tel"
            inputMode="tel"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            maxLength={30}
          />
        </Field>
        <Field label={t("restaurant.email")} hint={t("restaurant.emailHint")}>
          <Input
            type="email"
            inputMode="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Field label={t("restaurant.address")}>
          <Input
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            maxLength={300}
          />
        </Field>
        {error ? (
          <div className="sm:col-span-2">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
