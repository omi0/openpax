import type { PaymentConfigDto, UpdatePaymentConfigInput } from "@sitli/shared";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Card, Field, Input, Select, Switch } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { paymentConfigQuery } from "@/lib/queries";

export const Route = createFileRoute("/_app/r/$restaurantId/settings/payments")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(paymentConfigQuery(params.restaurantId)),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { t, i18n } = useTranslation();
  const { restaurantId } = Route.useParams();
  const queryClient = useQueryClient();
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
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
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
      setMessage({ tone: "success", text: t("app.saved") });
      await invalidate();
    },
    onError: (e) =>
      setMessage({ tone: "error", text: e instanceof ApiClientError ? e.message : t("app.error") }),
  });
  const test = useMutation({
    mutationFn: () => api.post(`${base}/test`),
    onSuccess: () => setMessage({ tone: "success", text: t("payments.testOk") }),
    onError: (e) =>
      setMessage({ tone: "error", text: e instanceof ApiClientError ? e.message : t("app.error") }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    save.mutate();
  };
  const money = (cents: number) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: cfg.currency }).format(
      cents / 100,
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card
        title={t("payments.stripe")}
        description={t("payments.stripeHint")}
        actions={
          cfg.connected ? (
            <Badge tone="confirmed">{t("payments.connected")}</Badge>
          ) : (
            <Badge tone="neutral">{t("payments.notConnected")}</Badge>
          )
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
          <Field label={t("payments.webhookUrl")} className="sm:col-span-2">
            <div className="flex gap-2">
              <Input value={cfg.webhookUrl} readOnly className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(cfg.webhookUrl)}
              >
                {t("app.copy")}
              </Button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{t("payments.webhookEvents")}</p>
          </Field>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={test.isPending}
            disabled={!cfg.secretKey.set}
            onClick={() => test.mutate()}
          >
            {t("payments.testConnection")}
          </Button>
        </div>
      </Card>

      <Card title={t("payments.policy")} description={t("payments.policyHint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("payments.mode")} className="sm:col-span-2">
            <Select
              value={form.mode}
              onChange={(e) =>
                setForm({ ...form, mode: e.target.value as UpdatePaymentConfigInput["mode"] })
              }
            >
              <option value="off">{t("payments.modes.off")}</option>
              <option value="deposit">{t("payments.modes.deposit")}</option>
              <option value="card_hold">{t("payments.modes.card_hold")}</option>
            </Select>
            <p className="mt-1 text-xs text-zinc-500">{t(`payments.modeHint.${form.mode}`)}</p>
          </Field>
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
              value={form.paymentWindowMinutes}
              onChange={(e) =>
                setForm({ ...form, paymentWindowMinutes: Number(e.target.value) || 30 })
              }
              disabled={form.mode !== "deposit"}
            />
          </Field>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                checked={form.refundOnCancel}
                onChange={(refundOnCancel) => setForm({ ...form, refundOnCancel })}
                label={t("payments.refundOnCancel")}
                disabled={form.mode !== "deposit"}
              />
              <span className="text-sm">{t("payments.refundOnCancel")}</span>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.chargeNoShow}
                onChange={(chargeNoShow) => setForm({ ...form, chargeNoShow })}
                label={t("payments.chargeNoShow")}
                disabled={form.mode !== "card_hold"}
              />
              <span className="text-sm">{t("payments.chargeNoShow")}</span>
            </div>
          </div>
        </div>
        {message ? (
          <div className="mt-4">
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={save.isPending}>
            {t("app.save")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
