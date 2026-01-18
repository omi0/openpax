import {
  NOTIFICATION_AUDIENCES,
  type NotificationTemplateDto,
  type NotificationTemplatePreview,
  TEMPLATE_VARIABLES,
  type UpsertNotificationTemplateInput,
} from "@sitli/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Dialog, Field, Input, Spinner, Textarea } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { restaurantQuery, templatesQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Locale = "it" | "en";

export function NotificationTemplates({ restaurantId }: { restaurantId: string }) {
  const { t } = useTranslation();
  const { data: restaurant } = useSuspenseQuery(restaurantQuery(restaurantId));
  const [locale, setLocale] = useState<Locale>(restaurant.locale);
  const templates = useQuery(templatesQuery(restaurantId, locale));
  const [editing, setEditing] = useState<NotificationTemplateDto | null>(null);

  const rows = templates.data ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-zinc-500">{t("templates.language")}</span>
        {(["it", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={cn(
              "rounded px-2 py-0.5 text-xs uppercase",
              locale === l ? "bg-zinc-200 font-semibold" : "text-zinc-500 hover:bg-zinc-100",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {templates.isLoading ? <Spinner /> : null}
      {NOTIFICATION_AUDIENCES.map((audience) => {
        const events = [
          ...new Set(rows.filter((r) => r.audience === audience).map((r) => r.event)),
        ];
        if (events.length === 0) return null;
        return (
          <div key={audience}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t(`notifications.audience.${audience}`)}
            </p>
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {events.map((event) => (
                <li key={event} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium">
                    {t(`notifications.event.${event}`)}
                  </span>
                  {rows
                    .filter((r) => r.audience === audience && r.event === event)
                    .map((r) => (
                      <button
                        key={r.channel}
                        type="button"
                        onClick={() => setEditing(r)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-zinc-50",
                          r.custom ? "border-brand text-brand" : "border-zinc-300 text-zinc-600",
                        )}
                      >
                        {t(`notifications.${r.channel}`)}
                        {r.custom ? <Badge tone="confirmed">{t("templates.custom")}</Badge> : null}
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {editing ? (
        <TemplateEditor
          key={`${editing.event}-${editing.channel}-${editing.audience}-${editing.locale}`}
          restaurantId={restaurantId}
          template={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function TemplateEditor({
  restaurantId,
  template,
  onClose,
}: {
  restaurantId: string;
  template: NotificationTemplateDto;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEmail = template.channel === "email";
  const [subject, setSubject] = useState(template.subject ?? "");
  const [heading, setHeading] = useState(template.heading ?? "");
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NotificationTemplatePreview | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const base = `/api/v1/restaurants/${restaurantId}/notification-templates`;
  const input = (): UpsertNotificationTemplateInput => ({
    event: template.event,
    channel: template.channel,
    audience: template.audience,
    locale: template.locale,
    ...(isEmail ? { subject, heading } : {}),
    body,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["restaurant", restaurantId, "notification-templates"],
    });
  const showError = (e: unknown) => {
    if (e instanceof ApiClientError && e.code === "unknown_placeholder") {
      const list = (e as unknown as { placeholders?: string[] }).placeholders;
      setError(
        t("templates.unknownPlaceholder", {
          placeholders: (list ?? []).map((p) => `{{${p}}}`).join(", ") || e.message,
        }),
      );
    } else setError(e instanceof ApiClientError ? e.message : t("app.error"));
  };

  // live preview, debounced
  useEffect(() => {
    const handle = setTimeout(() => {
      if (!body.trim()) return;
      api
        .post<NotificationTemplatePreview>(`${base}/preview`, input())
        .then((p) => {
          setPreview(p);
          setError(null);
        })
        .catch(showError);
    }, 400);
    return () => clearTimeout(handle);
  }, [subject, heading, body]);

  const save = useMutation({
    mutationFn: () => api.put<NotificationTemplateDto>(base, input()),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: showError,
  });
  const reset = useMutation({
    mutationFn: () =>
      api.delete(
        `${base}/${template.event}/${template.channel}/${template.audience}/${template.locale}`,
      ),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
    onError: showError,
  });

  const insert = (name: string) => {
    const el = bodyRef.current;
    const token = `{{${name}}}`;
    if (!el) {
      setBody((b) => b + token);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${t("templates.edit")} · ${t(`notifications.event.${template.event}`)} · ${t(`notifications.${template.channel}`)} · ${t(`notifications.audience.${template.audience}`)} · ${template.locale.toUpperCase()}`}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {isEmail ? (
            <>
              <Field label={t("templates.subject")}>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </Field>
              <Field label={t("templates.heading")}>
                <Input
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  maxLength={120}
                />
              </Field>
            </>
          ) : null}
          <Field
            label={t("templates.body")}
            hint={!isEmail ? t("templates.characters", { count: body.length }) : undefined}
          >
            <Textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              className={isEmail ? "min-h-40" : "min-h-24"}
            />
          </Field>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">{t("templates.placeholders")}</p>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_VARIABLES.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={t("templates.insert", { name: `{{${name}}}` })}
                  onClick={() => insert(name)}
                  className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs hover:bg-zinc-100"
                >
                  {t(`templates.variable.${name}`)}
                </button>
              ))}
            </div>
          </div>
          {error ? <Alert>{error}</Alert> : null}
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500">
            {t("templates.preview")} · {t("templates.previewHint")}
          </p>
          {preview ? (
            isEmail && preview.html ? (
              <div className="overflow-hidden rounded-lg border border-zinc-200">
                <p className="border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs">
                  <span className="text-zinc-500">{t("templates.subject")}:</span>{" "}
                  <span className="font-medium">{preview.subject}</span>
                </p>
                <iframe
                  title={t("templates.preview")}
                  srcDoc={preview.html}
                  sandbox=""
                  className="h-96 w-full bg-white"
                />
              </div>
            ) : (
              <pre className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm whitespace-pre-wrap">
                {preview.text}
              </pre>
            )
          ) : (
            <Spinner />
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {template.custom ? (
          <Button
            variant="outline"
            size="sm"
            loading={reset.isPending}
            onClick={() => {
              if (window.confirm(t("templates.confirmReset"))) reset.mutate();
            }}
          >
            {t("templates.reset")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("app.cancel")}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t("app.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
