import type { BookingPolicyDto, UpdateWidgetConfigInput, WidgetConfigDto } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Code, Copy, ExternalLink, Palette, SlidersHorizontal } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { PolicyForm } from "@/components/policy-form";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
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
  const toast = useToast();
  const widgetFormId = useId();
  const policyFormId = useId();
  const { data: widget } = useSuspenseQuery(widgetConfigQuery(restaurantId));
  const { data: policy } = useSuspenseQuery(policyQuery(restaurantId));
  const [w, setW] = useState<UpdateWidgetConfigInput>({ ...widget });
  const [error, setError] = useState<string | null>(null);

  const saveWidget = useMutation({
    mutationFn: () =>
      api.put<WidgetConfigDto>(`/api/v1/restaurants/${restaurantId}/widget-config`, w),
    onSuccess: async () => {
      toast.success(t("app.saved"));
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "widget"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const savePolicy = useMutation({
    mutationFn: (next: BookingPolicyDto) =>
      api.put<BookingPolicyDto>(`/api/v1/restaurants/${restaurantId}/policy`, next),
    onSuccess: async () => {
      toast.success(t("app.saved"));
      await queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "policy"] });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const copy = async () => {
    await navigator.clipboard.writeText(widget.embedSnippet);
    toast.success(t("app.copied"));
  };
  const submitWidget = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    saveWidget.mutate();
  };

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Code className="size-5 text-brand-700" /> {t("widget.embed")}
          </span>
        }
        description={t("widget.embedHint")}
        footer={
          <>
            <a
              href={widget.hostedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-xs hover:bg-stone-50"
            >
              <ExternalLink className="size-[18px]" /> {t("widget.hosted")}
            </a>
            <Button icon={<Copy />} onClick={() => void copy()}>
              {t("widget.copyCode")}
            </Button>
          </>
        }
      >
        <pre className="overflow-x-auto rounded-xl bg-stone-900 px-4 py-3.5 text-[13px] leading-relaxed text-stone-100">
          {widget.embedSnippet}
        </pre>
      </Card>

      {error ? <Alert>{error}</Alert> : null}

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <Palette className="size-5 text-brand-700" /> {t("widget.appearance")}
          </span>
        }
        description={t("widget.appearanceHint")}
        footer={
          <Button type="submit" form={widgetFormId} loading={saveWidget.isPending}>
            {t("app.save")}
          </Button>
        }
      >
        <form id={widgetFormId} onSubmit={submitWidget} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("widget.primaryColor")}>
            <div className="flex gap-2">
              <input
                type="color"
                aria-label={t("widget.primaryColor")}
                value={w.primaryColor}
                onChange={(e) => setW({ ...w, primaryColor: e.target.value })}
                className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-stone-300 bg-white p-1"
              />
              <Input
                value={w.primaryColor}
                onChange={(e) => setW({ ...w, primaryColor: e.target.value })}
                pattern="^#[0-9a-fA-F]{6}$"
                className="font-mono uppercase"
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
              inputMode="url"
              placeholder="https://"
              value={w.termsUrl ?? ""}
              onChange={(e) => setW({ ...w, termsUrl: e.target.value || null })}
            />
          </Field>
          <Field label={t("widget.privacy")}>
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={w.privacyUrl ?? ""}
              onChange={(e) => setW({ ...w, privacyUrl: e.target.value || null })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Switch
              checked={w.requirePhone}
              onChange={(requirePhone) => setW({ ...w, requirePhone })}
              label={t("widget.requirePhone")}
            />
          </div>
        </form>
      </Card>

      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-brand-700" /> {t("widget.policy")}
          </span>
        }
        description={t("widget.rulesHint")}
        footer={
          <Button type="submit" form={policyFormId} loading={savePolicy.isPending}>
            {t("app.save")}
          </Button>
        }
      >
        <PolicyForm
          key={JSON.stringify(policy)}
          initial={policy}
          id={policyFormId}
          onSubmit={(next) => {
            setError(null);
            savePolicy.mutate(next);
          }}
        />
      </Card>
    </div>
  );
}
