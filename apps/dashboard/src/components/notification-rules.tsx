import type { NotificationSettingDto } from "@sitli/shared";
import { NOTIFICATION_EVENTS } from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Input, Switch, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

const columns = [
  { channel: "email", audience: "guest" },
  { channel: "email", audience: "restaurant" },
  { channel: "sms", audience: "guest" },
  { channel: "sms", audience: "restaurant" },
] as const;

const key = (s: { event: string; channel: string; audience: string }) =>
  `${s.event}|${s.channel}|${s.audience}`;

const TIMED = new Set(["booking.reminder", "booking.feedback_request"]);

export function NotificationRules({
  restaurantId,
  settings,
  smsConfigured,
}: {
  restaurantId: string;
  settings: NotificationSettingDto[];
  smsConfigured: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<Map<string, NotificationSettingDto>>(
    () => new Map(settings.map((s) => [key(s), s])),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (k: string, patch: Partial<NotificationSettingDto>) => {
    const next = new Map(rows);
    const cur = next.get(k);
    if (cur) next.set(k, { ...cur, ...patch });
    setRows(next);
    setDirty(true);
  };
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/restaurants/${restaurantId}/notification-settings`, {
        settings: [...rows.values()],
      }),
    onSuccess: async () => {
      setDirty(false);
      setError(null);
      toast.success(t("app.saved"));
      await queryClient.invalidateQueries({
        queryKey: ["restaurant", restaurantId, "notification-settings"],
      });
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  return (
    <div className="space-y-4">
      {!smsConfigured ? <Alert tone="info">{t("notifications.smsNeedsProvider")}</Alert> : null}
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th rowSpan={2} className="pb-2 text-left align-bottom font-medium text-stone-500">
                {t("notifications.eventColumn")}
              </th>
              <th colSpan={2} className="border-l border-stone-100 px-2 pb-1 text-center">
                <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                  <Mail className="size-4 text-brand-700" /> {t("notifications.email")}
                </span>
              </th>
              <th colSpan={2} className="border-l border-stone-100 px-2 pb-1 text-center">
                <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                  <MessageSquare className="size-4 text-brand-700" /> {t("notifications.sms")}
                </span>
              </th>
            </tr>
            <tr className="text-xs text-stone-500">
              {columns.map((c, i) => (
                <th
                  key={`${c.channel}-${c.audience}`}
                  className={cn(
                    "px-2 pb-2 text-center font-medium",
                    i % 2 === 0 && "border-l border-stone-100",
                  )}
                >
                  {t(`notifications.audience.${c.audience}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {NOTIFICATION_EVENTS.map((event) => (
              <tr key={event}>
                <td className="py-3 pr-4">
                  <p className="font-medium text-stone-900">{t(`notifications.event.${event}`)}</p>
                  {TIMED.has(event) ? (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                      {columns.map((c) => {
                        const s = rows.get(key({ event, ...c }));
                        if (!s) return null;
                        return (
                          // biome-ignore lint/a11y/noLabelWithoutControl: wraps an Input component
                          <label
                            key={`${c.channel}-${c.audience}`}
                            className="flex items-center gap-1.5 text-[13px] text-stone-500"
                          >
                            {t(`notifications.${c.channel}`)} ·{" "}
                            {t(`notifications.audience.${c.audience}`)}:
                            <Input
                              type="number"
                              min={1}
                              max={168}
                              className="h-8 w-16 px-2 text-center"
                              value={Math.round((s.offsetMinutes ?? 1440) / 60)}
                              onChange={(e) =>
                                update(key({ event, ...c }), {
                                  offsetMinutes: Math.max(1, Number(e.target.value) || 1) * 60,
                                })
                              }
                            />
                            {event === "booking.reminder"
                              ? t("notifications.hoursBefore")
                              : t("notifications.hoursAfter")}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </td>
                {columns.map((c, i) => {
                  const k = key({ event, ...c });
                  const s = rows.get(k);
                  return (
                    <td
                      key={k}
                      className={cn(
                        "px-2 py-3 text-center",
                        i % 2 === 0 && "border-l border-stone-100",
                      )}
                    >
                      {s ? (
                        <span className="inline-flex">
                          <Switch
                            checked={s.enabled}
                            onChange={(enabled) => update(k, { enabled })}
                            disabled={c.channel === "sms" && !smsConfigured && !s.enabled}
                            ariaLabel={`${t(`notifications.event.${event}`)} · ${t(`notifications.${c.channel}`)} · ${t(`notifications.audience.${c.audience}`)}`}
                          />
                        </span>
                      ) : (
                        <span className="text-stone-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <div className="flex items-center justify-end gap-3 border-t border-stone-100 pt-4">
        {dirty ? (
          <span className="text-sm text-stone-500">{t("notifications.unsaved")}</span>
        ) : null}
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          {t("app.save")}
        </Button>
      </div>
    </div>
  );
}
