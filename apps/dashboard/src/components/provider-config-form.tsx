import type {
  NotificationChannel,
  ProviderConfigDto,
  ProviderDescriptorDto,
  ProviderFieldDto,
} from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Field, Input, Select, Switch } from "@/components/ui";
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
  const [providerId, setProviderId] = useState(current.providerId ?? "");
  const provider = providers.find((p) => p.id === providerId);
  const [values, setValues] = useState<Record<string, Value>>(() =>
    initialValues(provider, current),
  );
  const [scope, setScope] = useState<"restaurant" | "organization">(
    current.scope === "organization" ? "organization" : "restaurant",
  );
  const [testTo, setTestTo] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
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
      setMessage({ tone: "success", text: t("app.saved") });
      await invalidate();
    },
    onError: (e) =>
      setMessage({
        tone: "error",
        text:
          e instanceof ApiClientError
            ? [e.message, ...(e.issues ?? []).map((i) => `${i.path}: ${i.message}`)].join(" · ")
            : t("app.error"),
      }),
  });
  const test = useMutation({
    mutationFn: () => api.post<{ providerId: string }>(`${base}/test`, { to: testTo }),
    onSuccess: (r) =>
      setMessage({
        tone: "success",
        text: t("notifications.testSent", { provider: r.providerId }),
      }),
    onError: (e) =>
      setMessage({ tone: "error", text: e instanceof ApiClientError ? e.message : t("app.error") }),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">{t("notifications.provider")}:</span>
        <Badge tone={current.scope === "none" ? "neutral" : "confirmed"}>
          {t(`notifications.scope.${current.scope}`)}
        </Badge>
        {current.providerId ? (
          <span className="font-medium">
            {providers.find((p) => p.id === current.providerId)?.label ?? current.providerId}
          </span>
        ) : null}
      </div>
      {channel === "email" && current.scope === "instance" ? (
        <p className="text-xs text-zinc-500">{t("notifications.instanceHint")}</p>
      ) : null}
      <Field label={t("notifications.chooseProvider")}>
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
        <>
          {provider.description ? (
            <p className="text-sm text-zinc-500">{provider.description}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {provider.fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                hint={f.secret ? secretHint(f) : f.help}
                className={f.type === "boolean" ? "flex items-center gap-3" : ""}
              >
                {f.type === "boolean" ? (
                  <Switch
                    checked={values[f.key] === true}
                    onChange={(v) => setValues({ ...values, [f.key]: v })}
                    label={f.label}
                  />
                ) : f.type === "select" ? (
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
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-500">{t("notifications.saveFor")}</span>
            <Select
              value={scope}
              onChange={(e) => setScope(e.target.value as "restaurant" | "organization")}
              className="w-auto"
            >
              <option value="restaurant">{t("notifications.scope.restaurant")}</option>
              <option value="organization">{t("notifications.scope.organization")}</option>
            </Select>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              {t("app.save")}
            </Button>
            {current.providerId && current.scope !== "instance" && current.scope !== "none" ? (
              <Button variant="outline" onClick={() => remove.mutate()} loading={remove.isPending}>
                {t("notifications.remove")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {current.providerId ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-zinc-100 pt-3">
          <Field label={t("notifications.testTo")} className="flex-1">
            <Input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder={channel === "email" ? "you@example.com" : "+39 333 1234567"}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => test.mutate()}
            loading={test.isPending}
            disabled={!testTo}
          >
            {t("notifications.test")}
          </Button>
        </div>
      ) : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </div>
  );
}
