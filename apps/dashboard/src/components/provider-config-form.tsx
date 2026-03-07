import type {
  NotificationChannel,
  ProviderConfigDto,
  ProviderDescriptorDto,
  ProviderFieldDto,
} from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Field, Input, Select, Switch, useConfirm, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";

type Value = string | number | boolean | null;

function initialValues(
  provider: ProviderDescriptorDto | undefined,
  current: ProviderConfigDto,
): Record<string, Value> {
  const out: Record<string, Value> = {};
  if (!provider) return out;
  for (const f of provider.fields) {
    const v = current.providerId === provider.id ? current.config[f.key] : undefined;
    if (f.secret) out[f.key] = "";
    else if (typeof v === "object" && v !== null) out[f.key] = "";
    else out[f.key] = (v as Value) ?? (f.type === "boolean" ? false : "");
  }
  return out;
}

export function ProviderConfigForm({
  restaurantId,
  channel,
  providers,
  current,
}: {
  restaurantId: string;
  channel: NotificationChannel;
  providers: ProviderDescriptorDto[];
  current: ProviderConfigDto;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [providerId, setProviderId] = useState(current.providerId ?? "");
  const provider = providers.find((p) => p.id === providerId);
  const [values, setValues] = useState<Record<string, Value>>(() =>
    initialValues(provider, current),
  );
  const [scope, setScope] = useState<"restaurant" | "organization">(
    current.scope === "organization" ? "organization" : "restaurant",
  );
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/restaurants/${restaurantId}/notification-providers/${channel}`;
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, "provider", channel] });

  const choose = (id: string) => {
    setProviderId(id);
    setValues(
      initialValues(
        providers.find((p) => p.id === id),
        current,
      ),
    );
  };

  const save = useMutation({
    mutationFn: () => {
      const config: Record<string, Value> = {};
      for (const [k, v] of Object.entries(values))
        if (!(v === "" && provider?.fields.find((f) => f.key === k)?.secret))
          config[k] = v === "" ? null : v;
      return api.put<ProviderConfigDto>(base, { providerId, enabled: true, config, scope });
    },
    onSuccess: async () => {
      setError(null);
      toast.success(t("app.saved"));
      await invalidate();
    },
    onError: (e) =>
      setError(
        e instanceof ApiClientError
          ? [e.message, ...(e.issues ?? []).map((i) => `${i.path}: ${i.message}`)].join(" · ")
          : t("app.error"),
      ),
  });
  const test = useMutation({
    mutationFn: () => api.post<{ providerId: string }>(`${base}/test`, { to: testTo }),
    onSuccess: (r) => {
      setError(null);
      toast.success(t("notifications.testSent", { provider: r.providerId }));
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });
  const remove = useMutation({
    mutationFn: () => api.delete<ProviderConfigDto>(base, { scope }),
    onSuccess: async () => {
      setProviderId("");
      await invalidate();
    },
  });

  const secretHint = (f: ProviderFieldDto) => {
    const v = current.providerId === providerId ? current.config[f.key] : undefined;
    return typeof v === "object" && v !== null && "set" in v && v.set
      ? `•••• ${(v as { last4?: string }).last4 ?? ""} — ${t("notifications.keepSecret")}`
      : undefined;
  };
  const currentLabel = current.providerId
    ? (providers.find((p) => p.id === current.providerId)?.label ?? current.providerId)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-stone-50 px-3.5 py-3 text-[15px]">
        <span className="text-stone-500">{t("notifications.status")}:</span>
        <span className="font-semibold text-stone-900">
          {currentLabel ?? t("notifications.none")}
        </span>
        {channel === "email" && current.scope === "instance" ? (
          <span className="basis-full text-[13px] text-stone-500">
            {t("notifications.instanceHint")}
          </span>
        ) : null}
      </div>

      <Field label={t("notifications.chooseProvider")} className="sm:max-w-md">
        <Select value={providerId} onChange={(e) => choose(e.target.value)}>
          <option value="">—</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      {provider ? (
        <div className="space-y-4 rounded-xl border border-stone-200 p-4">
          <div>
            <p className="font-semibold">
              {t("notifications.providerFields", { provider: provider.label })}
            </p>
            {provider.description ? (
              <p className="mt-0.5 text-sm text-stone-500">{provider.description}</p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {provider.fields.map((f) =>
              f.type === "boolean" ? (
                <div key={f.key} className="sm:col-span-2">
                  <Switch
                    checked={values[f.key] === true}
                    onChange={(v) => setValues({ ...values, [f.key]: v })}
                    label={f.label}
                    description={f.help}
                  />
                </div>
              ) : (
                <Field key={f.key} label={f.label} hint={f.secret ? secretHint(f) : f.help}>
                  {f.type === "select" ? (
                    <Select
                      value={String(values[f.key] ?? "")}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    >
                      <option value="">—</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={
                        f.type === "password" ? "password" : f.type === "number" ? "number" : "text"
                      }
                      value={String(values[f.key] ?? "")}
                      placeholder={f.placeholder}
                      required={f.required && !(f.secret && secretHint(f))}
                      autoComplete="off"
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [f.key]:
                            f.type === "number"
                              ? e.target.value === ""
                                ? ""
                                : Number(e.target.value)
                              : e.target.value,
                        })
                      }
                    />
                  )}
                </Field>
              ),
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-stone-100 pt-4">
            <Field label={t("notifications.saveFor")}>
              <Select
                value={scope}
                onChange={(e) => setScope(e.target.value as "restaurant" | "organization")}
                wrapperClassName="w-auto"
                className="w-auto"
              >
                <option value="restaurant">{t("notifications.scope.restaurant")}</option>
                <option value="organization">{t("notifications.scope.organization")}</option>
              </Select>
            </Field>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              {t("app.save")}
            </Button>
            {current.providerId && current.scope !== "instance" && current.scope !== "none" ? (
              <Button
                variant="ghost"
                loading={remove.isPending}
                onClick={async () => {
                  if (await confirm({ title: t("notifications.confirmRemove") })) remove.mutate();
                }}
              >
                {t("notifications.remove")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {current.providerId ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label={t("notifications.testTo")}
            hint={t("notifications.testHint")}
            className="min-w-56 flex-1 sm:max-w-md"
          >
            <Input
              type={channel === "email" ? "email" : "tel"}
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={channel === "email" ? "you@example.com" : "+39 333 1234567"}
            />
          </Field>
          <Button
            variant="secondary"
            icon={<Send />}
            onClick={() => test.mutate()}
            loading={test.isPending}
            disabled={!testTo}
            className="mb-[1.6rem]"
          >
            {t("notifications.test")}
          </Button>
        </div>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
    </div>
  );
}
