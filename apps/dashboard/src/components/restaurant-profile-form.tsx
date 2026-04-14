import type { RestaurantDto, UpdateRestaurantInput } from "@openpax/shared";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { TIMEZONES } from "@/lib/timezones";

export const restaurantToInput = (r: RestaurantDto): UpdateRestaurantInput => ({
  name: r.name,
  timezone: r.timezone,
  locale: r.locale,
  currency: r.currency,
  address: r.address ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
});

/**
 * Name, contacts and language of a restaurant. The host owns the save call;
 * when `id` is given the submit button is rendered by the host via `form={id}`.
 */
export function RestaurantProfileForm({
  restaurant,
  onSubmit,
  busy,
  error,
  id,
  submitLabel,
}: {
  restaurant: RestaurantDto;
  onSubmit: (body: UpdateRestaurantInput) => void;
  busy?: boolean;
  error?: string | null;
  id?: string;
  submitLabel?: string;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<UpdateRestaurantInput>(() => restaurantToInput(restaurant));
  const timezones = TIMEZONES.includes(restaurant.timezone)
    ? TIMEZONES
    : [restaurant.timezone, ...TIMEZONES];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // empty optional fields would be stored as empty strings; drop them so the columns become null
    const body: UpdateRestaurantInput = { ...form };
    for (const key of ["address", "phone", "email"] as const)
      if (!body[key]?.trim()) delete body[key];
    onSubmit(body);
  };

  return (
    <form id={id} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label={t("restaurant.name")} className="sm:col-span-2" required>
        <Input
          value={form.name ?? ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          maxLength={120}
        />
      </Field>
      <Field label={t("restaurant.slug")} hint={t("restaurant.slugHint")} className="sm:col-span-2">
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
      {id ? null : (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={busy}>
            {submitLabel ?? t("app.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
