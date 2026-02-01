import type { BookingPolicyDto, UpdateWidgetConfigInput, WidgetConfigDto } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, ExternalLink } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Field, Input, Select, Switch, Textarea } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { policyQuery, widgetConfigQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/widget")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(widgetConfigQuery(params.restaurantId)),
      context.queryClient.ensureQueryData(policyQuery(params.restaurantId)),
    ]);
  },
  component: WidgetPage,
});

function WidgetPage() {
  const { t } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: widget } = useSuspenseQuery(widgetConfigQuery(restaurantId));
  const { data: policy } = useSuspenseQuery(policyQuery(restaurantId));
  const [copied, setCopied] = useState(false);
  const [w, setW] = useState<UpdateWidgetConfigInput>({ ...widget });
  const [p, setP] = useState<BookingPolicyDto>({ ...policy });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const saveWidget = useMutation({
    mutationFn: () =>
      api.put<WidgetConfigDto>(`/api/v1/restaurants/${restaurantId}/widget-config`, w),
    onSuccess: async () => {
      setSaved("widget");
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "widget"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const savePolicy = useMutation({
    mutationFn: () => api.put<BookingPolicyDto>(`/api/v1/restaurants/${restaurantId}/policy`, p),
    onSuccess: async () => {
      setSaved("policy");
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "policy"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const copy = async () => {
    await navigator.clipboard.writeText(widget.embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const submitWidget = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    saveWidget.mutate();
  };
  const submitPolicy = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    savePolicy.mutate();
  };
  const numOrNull = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="space-y-4">
      <Card title={t("widget.embed")} description={t("widget.embedHint")}>
        <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-3 text-xs text-zinc-100">
          {widget.embedSnippet}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copy()}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}{" "}
            {copied ? t("app.copied") : t("app.copy")}
          </Button>
          <a
            href={widget.hostedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm hover:bg-zinc-50"
          >
            <ExternalLink className="size-4" /> {t("widget.hosted")}
          </a>
        </div>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      <Card title={t("widget.appearance")}>
        <form onSubmit={submitWidget} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("widget.primaryColor")}>
            <div className="flex gap-2">
              <input
                type="color"
                value={w.primaryColor}
                onChange={(e) => setW({ ...w, primaryColor: e.target.value })}
                className="h-10 w-14 rounded border border-zinc-300"
              />
              <Input
                value={w.primaryColor}
                onChange={(e) => setW({ ...w, primaryColor: e.target.value })}
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
          </Field>
          <Field label={t("widget.defaultLocale")}>
            <Select
              value={w.defaultLocale}
              onChange={(e) => setW({ ...w, defaultLocale: e.target.value as "it" | "en" })}
            >
              <option value="it">Italiano</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <Field label={t("widget.welcome")} className="sm:col-span-2">
            <Textarea
              value={w.welcomeMessage ?? ""}
              maxLength={500}
              onChange={(e) => setW({ ...w, welcomeMessage: e.target.value || null })}
            />
          </Field>
          <Field label={t("widget.terms")}>
            <Input
              type="url"
              value={w.termsUrl ?? ""}
              onChange={(e) => setW({ ...w, termsUrl: e.target.value || null })}
            />
          </Field>
          <Field label={t("widget.privacy")}>
            <Input
              type="url"
              value={w.privacyUrl ?? ""}
              onChange={(e) => setW({ ...w, privacyUrl: e.target.value || null })}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Switch
              checked={w.requirePhone}
              onChange={(requirePhone) => setW({ ...w, requirePhone })}
              label={t("widget.requirePhone")}
            />
            <span className="text-sm">{t("widget.requirePhone")}</span>
          </div>
          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            {saved === "widget" ? (
              <span className="text-sm text-emerald-700">{t("app.saved")}</span>
            ) : null}
            <Button type="submit" loading={saveWidget.isPending}>
              {t("app.save")}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t("widget.policy")}>
        <form onSubmit={submitPolicy} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("widget.minLead")}>
            <Input
              type="number"
              min={0}
              value={p.minLeadMinutes}
              onChange={(e) => setP({ ...p, minLeadMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("widget.maxAdvance")}>
            <Input
              type="number"
              min={0}
              max={730}
              value={p.maxAdvanceDays}
              onChange={(e) => setP({ ...p, maxAdvanceDays: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("widget.minParty")}>
            <Input
              type="number"
              min={1}
              value={p.minPartySize}
              onChange={(e) => setP({ ...p, minPartySize: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("widget.maxParty")}>
            <Input
              type="number"
              min={1}
              value={p.maxPartySize}
              onChange={(e) => setP({ ...p, maxPartySize: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("widget.cutoff")}>
            <Input
              type="number"
              min={0}
              value={p.cancellationCutoffMinutes}
              onChange={(e) => setP({ ...p, cancellationCutoffMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("widget.largeParty")} hint={t("widget.largePartyHint")}>
            <Input
              type="number"
              min={1}
              value={p.largePartyThreshold ?? ""}
              onChange={(e) => setP({ ...p, largePartyThreshold: numOrNull(e.target.value) })}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Switch
              checked={p.autoConfirm}
              onChange={(autoConfirm) => setP({ ...p, autoConfirm })}
              label={t("widget.autoConfirm")}
            />
            <span className="text-sm">{t("widget.autoConfirm")}</span>
          </div>
          <div className="space-y-3 rounded-lg border border-zinc-200 p-3 sm:col-span-2">
            <p className="text-sm font-medium">{t("widget.waitlist")}</p>
            <p className="text-xs text-zinc-500">{t("widget.waitlistHint")}</p>
            <div className="flex items-center gap-3">
              <Switch
                checked={p.waitlistEnabled}
                onChange={(waitlistEnabled) => setP({ ...p, waitlistEnabled })}
                label={t("widget.waitlistEnabled")}
              />
              <span className="text-sm">{t("widget.waitlistEnabled")}</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={p.waitlistAutoOffer}
                onChange={(waitlistAutoOffer) => setP({ ...p, waitlistAutoOffer })}
                label={t("widget.waitlistAutoOffer")}
                disabled={!p.waitlistEnabled}
              />
              <span className="text-sm">{t("widget.waitlistAutoOffer")}</span>
            </div>
            <Field label={t("widget.waitlistOfferMinutes")} className="sm:max-w-xs">
              <Input
                type="number"
                min={15}
                max={10080}
                value={p.waitlistOfferMinutes}
                disabled={!p.waitlistEnabled}
                onChange={(e) => setP({ ...p, waitlistOfferMinutes: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-3 sm:col-span-2">
            {saved === "policy" ? (
              <span className="text-sm text-emerald-700">{t("app.saved")}</span>
            ) : null}
            <Button type="submit" loading={savePolicy.isPending}>
              {t("app.save")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
