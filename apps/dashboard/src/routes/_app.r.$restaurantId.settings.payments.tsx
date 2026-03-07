import type { PaymentConfigDto, UpdatePaymentConfigInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, CircleAlert, Copy, CreditCard, Landmark, ShieldCheck } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Switch,
  useToast,
} from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { paymentConfigQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/payments")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(paymentConfigQuery(params.restaurantId)),
  component: PaymentsPage,
});

type Mode = UpdatePaymentConfigInput["mode"];

const modeIcons: Record<Mode, ReactNode> = {
  off: <CircleAlert />,
  deposit: <Landmark />,
  card_hold: <ShieldCheck />,
};

function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: cfg } = useSuspenseQuery(paymentConfigQuery(restaurantId));
  const [form, setForm] = useState<UpdatePaymentConfigInput>({
    mode: cfg.mode,
    amountCents: cfg.amountCents,
    minPartySize: cfg.minPartySize,
    paymentWindowMinutes: cfg.paymentWindowMinutes,
    refundOnCancel: cfg.refundOnCancel,
    chargeNoShow: cfg.chargeNoShow,
  });
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/restaurants/${restaurantId}/payments`;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "payments"] });

  const save = useMutation({
    mutationFn: () =>
      api.put<PaymentConfigDto>(`${base}/config`, {
        ...form,
        ...(secretKey ? { secretKey } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      }),
    onSuccess: async () => {
      setSecretKey("");
      setWebhookSecret("");
      setError(null);
      toast.success(t("app.saved"));
      await invalidate();
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const test = useMutation({
    mutationFn: () => api.post(`${base}/test`),
    onSuccess: () => {
      setError(null);
      toast.success(t("payments.testOk"));
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    save.mutate();
  };
  const money = (cents: number) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: cfg.currency }).format(
      cents / 100,
    );
  const modes: Mode[] = ["off", "deposit", "card_hold"];

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-2">
            <CreditCard className="size-5 text-brand-700" /> {t("payments.stripe")}
          </span>
        }
        description={t("payments.stripeHint")}
        actions={
          cfg.connected ? (
            <Badge tone="success" icon={<BadgeCheck />}>
              {t("payments.connected")}
            </Badge>
          ) : (
            <Badge tone="neutral" icon={<CircleAlert />}>
              {t("payments.notConnected")}
            </Badge>
          )
        }
        footer={
          <Button
            type="button"
            variant="outline"
            loading={test.isPending}
            disabled={!cfg.secretKey.set}
            onClick={() => test.mutate()}
          >
            {t("payments.testConnection")}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("payments.secretKey")}
            hint={
              cfg.secretKey.set
                ? t("payments.secretSet", { last4: cfg.secretKey.last4 ?? "" })
                : t("payments.secretUnset")
            }
          >
            <Input
              type="password"
              autoComplete="off"
              placeholder="sk_live_…"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
            />
          </Field>
          <Field
            label={t("payments.webhookSecret")}
            hint={
              cfg.webhookSecret.set
                ? t("payments.secretSet", { last4: cfg.webhookSecret.last4 ?? "" })
                : t("payments.webhookHint")
            }
          >
            <Input
              type="password"
              autoComplete="off"
              placeholder="whsec_…"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
          </Field>
          <Field
            label={t("payments.webhookUrl")}
            hint={t("payments.webhookEvents")}
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <Input
                value={cfg.webhookUrl}
                readOnly
                className="bg-stone-50 font-mono text-[13px] text-stone-600"
              />
              <IconButton
                label={t("app.copy")}
                variant="outline"
                onClick={() => {
                  void navigator.clipboard?.writeText(cfg.webhookUrl);
                  toast.success(t("app.copied"));
                }}
              >
                <Copy />
              </IconButton>
            </div>
          </Field>
        </div>
      </Card>

      <Card
        title={t("payments.policy")}
        description={t("payments.policyHint")}
        footer={
          <Button type="submit" loading={save.isPending}>
            {t("app.save")}
          </Button>
        }
      >
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-medium text-stone-700">{t("payments.mode")}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {modes.map((m) => {
              const on = form.mode === m;
              return (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                    on
                      ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20"
                      : "border-stone-200 bg-white hover:border-stone-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[18px]",
                      on ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-500",
                    )}
                  >
                    {modeIcons[m]}
                  </span>
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={on}
                    onChange={() => setForm({ ...form, mode: m })}
                    className="order-last mt-1 size-5 shrink-0 appearance-none rounded-full border border-stone-300 bg-white transition checked:border-[6px] checked:border-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold leading-snug text-stone-900">
                      {t(`payments.modes.${m}`)}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-stone-500">
                      {t(`payments.modeHint.${m}`)}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className={cn("grid gap-4 sm:grid-cols-2", form.mode === "off" && "opacity-60")}>
          <Field
            label={t("payments.amount", { currency: cfg.currency })}
            hint={
              form.amountCents > 0
                ? t("payments.amountHint", { total: money(form.amountCents * 4) })
                : undefined
            }
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={(form.amountCents / 100).toFixed(2)}
              onChange={(e) =>
                setForm({ ...form, amountCents: Math.round(Number(e.target.value) * 100) })
              }
              disabled={form.mode === "off"}
            />
          </Field>
          <Field label={t("payments.minParty")} hint={t("payments.minPartyHint")}>
            <Input
              type="number"
              min={1}
              inputMode="numeric"
              value={form.minPartySize ?? ""}
              onChange={(e) =>
                setForm({ ...form, minPartySize: e.target.value ? Number(e.target.value) : null })
              }
              disabled={form.mode === "off"}
            />
          </Field>
          <Field label={t("payments.window")} hint={t("payments.windowHint")}>
            <Input
              type="number"
              min={10}
              max={1440}
              inputMode="numeric"
              value={form.paymentWindowMinutes}
              onChange={(e) =>
                setForm({ ...form, paymentWindowMinutes: Number(e.target.value) || 30 })
              }
              disabled={form.mode !== "deposit"}
            />
          </Field>
          <div className="space-y-4 sm:pt-7">
            <Switch
              checked={form.refundOnCancel}
              onChange={(refundOnCancel) => setForm({ ...form, refundOnCancel })}
              label={t("payments.refundOnCancel")}
              disabled={form.mode !== "deposit"}
            />
            <Switch
              checked={form.chargeNoShow}
              onChange={(chargeNoShow) => setForm({ ...form, chargeNoShow })}
              label={t("payments.chargeNoShow")}
              disabled={form.mode !== "card_hold"}
            />
          </div>
        </div>
        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </Card>
    </form>
  );
}
