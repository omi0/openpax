import type { NotificationSettingDto } from "@sitli/shared";
import { NOTIFICATION_EVENTS } from "@sitli/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Input, Switch } from "@/components/ui";
import { api } from "@/lib/api";

const columns = [
  { channel: "email", audience: "guest" },
  { channel: "email", audience: "restaurant" },
  { channel: "sms", audience: "guest" },
  { channel: "sms", audience: "restaurant" },
] as const;

const key = (s: { event: string; channel: string; audience: string }) =>
  `${s.event}|${s.channel}|${s.audience}`;

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
  const [rows, setRows] = useState<Map<string, NotificationSettingDto>>(
    () => new Map(settings.map((s) => [key(s), s])),
  );
  const [saved, setSaved] = useState(false);
  const update = (k: string, patch: Partial<NotificationSettingDto>) => {
    const next = new Map(rows);
    const cur = next.get(k);
    if (cur) next.set(k, { ...cur, ...patch });
    setRows(next);
    setSaved(false);
  };
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/v1/restaurants/${restaurantId}/notification-settings`, {
        settings: [...rows.values()],
      }),
    onSuccess: async () => {
      setSaved(true);
      await queryClient.invalidateQueries({
        queryKey: ["restaurant", restaurantId, "notification-settings"],
      });
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t("notifications.rulesHint")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-4 font-medium" />
              {columns.map((c) => (
                <th
                  key={`${c.channel}-${c.audience}`}
                  className="px-2 py-2 text-center font-medium"
                >
                  {t(`notifications.${c.channel}`)}
                  <br />
                  <span className="normal-case text-zinc-400">
                    {t(`notifications.audience.${c.audience}`)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {NOTIFICATION_EVENTS.map((event) => (
              <tr key={event}>
                <td className="py-2 pr-4">
                  <p className="font-medium">{t(`notifications.event.${event}`)}</p>
                  {event === "booking.reminder" || event === "booking.feedback_request" ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {columns.map((c) => {
                        const s = rows.get(key({ event, ...c }));
                        if (!s) return null;
                        return (
                          // biome-ignore lint/a11y/noLabelWithoutControl: wraps an Input component
                          <label
                            key={`${c.channel}-${c.audience}`}
                            className="flex items-center gap-1 text-xs text-zinc-500"
                          >
                            {t(`notifications.${c.channel}`)}:
                            <Input
                              type="number"
                              min={1}
                              max={168}
                              className="h-7 w-16"
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
                {columns.map((c) => {
                  const k = key({ event, ...c });
                  const s = rows.get(k);
                  return (
                    <td key={k} className="px-2 py-2 text-center">
                      {s ? (
                        <Switch
                          checked={s.enabled}
                          onChange={(enabled) => update(k, { enabled })}
                          disabled={c.channel === "sms" && !smsConfigured && !s.enabled}
                          label={k}
                        />
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          {t("app.save")}
        </Button>
        {saved ? <Alert tone="success">{t("app.saved")}</Alert> : null}
      </div>
    </div>
  );
}
