import {
  NOTIFICATION_AUDIENCES,
  type NotificationTemplateDto,
  type NotificationTemplatePreview,
  TEMPLATE_VARIABLES,
  type UpsertNotificationTemplateInput,
} from "@sitli/shared";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Mail, MessageSquare, Pencil, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Segmented,
  Spinner,
  Textarea,
  useConfirm,
  useToast,
} from "@/components/ui";
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-stone-700">{t("templates.language")}</span>
        <Segmented
          size="sm"
          ariaLabel={t("templates.language")}
          value={locale}
          onChange={setLocale}
          options={[
            { value: "it", label: "Italiano" },
            { value: "en", label: "English" },
          ]}
        />
      </div>
      {templates.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : null}
      {NOTIFICATION_AUDIENCES.map((audience) => {
        const events = [
          ...new Set(rows.filter((r) => r.audience === audience).map((r) => r.event)),
        ];
        if (events.length === 0) return null;
        return (
          <div key={audience}>
            <p className="mb-2 text-[13px] font-semibold text-stone-500 uppercase tracking-wide">
              {t("templates.forAudience", { audience: t(`notifications.audience.${audience}`) })}
            </p>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200">
              {events.map((event) => (
                <li
                  key={event}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-[15px]"
                >
                  <span className="min-w-0 flex-1 basis-40 font-medium text-stone-900">
                    {t(`notifications.event.${event}`)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {rows
                      .filter((r) => r.audience === audience && r.event === event)
                      .map((r) => (
                        <button
                          key={r.channel}
                          type="button"
                          onClick={() => setEditing(r)}
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors [&_svg]:size-4",
                            r.custom
                              ? "border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100"
                              : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50",
                          )}
                        >
                          {r.channel === "email" ? <Mail /> : <MessageSquare />}
                          {t(`notifications.${r.channel}`)}
                          {r.custom ? (
                            <Badge tone="brand" size="sm">
                              {t("templates.custom")}
                            </Badge>
                          ) : (
                            <Pencil className="text-stone-400" />
                          )}
                        </button>
                      ))}
                  </div>
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
  const toast = useToast();
  const confirm = useConfirm();
  const isEmail = template.channel === "email";
  const [subject, setSubject] = useState(template.subject ?? "");
  const [heading, setHeading] = useState(template.heading ?? "");
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<NotificationTemplatePreview | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // caret position of the body field, remembered so chips insert where the user was typing
  const caret = useRef<number | null>(null);
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
      toast.success(t("app.saved"));
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
    const at = caret.current ?? body.length;
    const next = `${body.slice(0, at)}${token}${body.slice(at)}`;
    setBody(next);
    caret.current = at + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const rememberCaret = () => {
    caret.current = bodyRef.current?.selectionStart ?? null;
  };

  return (
    <Dialog
      open
      size="xl"
      onClose={onClose}
      title={t("templates.editChannel", { channel: t(`notifications.${template.channel}`) })}
      description={`${t(`notifications.event.${template.event}`)} · ${t(`notifications.audience.${template.audience}`)} · ${template.locale.toUpperCase()}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {template.custom ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RotateCcw />}
              loading={reset.isPending}
              onClick={async () => {
                if (await confirm({ title: t("templates.confirmReset") })) reset.mutate();
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
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
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
              onChange={(e) => {
                setBody(e.target.value);
                caret.current = e.target.selectionStart;
              }}
              onSelect={rememberCaret}
              onKeyUp={rememberCaret}
              onClick={rememberCaret}
              maxLength={4000}
              className={isEmail ? "min-h-44" : "min-h-28"}
            />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-stone-500">
              {t("templates.placeholders")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_VARIABLES.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={t("templates.insert", { name: `{{${name}}}` })}
                  onClick={() => insert(name)}
                  className="h-8 rounded-full border border-stone-300 bg-white px-3 text-[13px] font-medium text-stone-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800"
                >
                  {t(`templates.variable.${name}`)}
                </button>
              ))}
            </div>
          </div>
          {error ? <Alert>{error}</Alert> : null}
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-stone-500">
            {t("templates.preview")} · {t("templates.previewHint")}
          </p>
          {preview ? (
            isEmail && preview.html ? (
              <div className="overflow-hidden rounded-xl border border-stone-200">
                <p className="border-b border-stone-100 bg-stone-50 px-3 py-2 text-sm">
                  <span className="text-stone-500">{t("templates.subject")}:</span>{" "}
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
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <div className="mx-auto max-w-xs rounded-2xl rounded-bl-md bg-white px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap shadow-card">
                  {preview.text}
                </div>
              </div>
            )
          ) : body.trim() ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
              {t("templates.noPreview")}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
