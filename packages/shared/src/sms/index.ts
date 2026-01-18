import type { Locale } from "../schemas/common.js";
import type { NotificationAudience, NotificationEvent } from "../schemas/notifications.js";
import {
  defaultTemplates,
  fillTemplate,
  type SmsTemplate,
  type TemplateVars,
} from "../templates/index.js";

export type SmsTemplateVars = TemplateVars;

export function renderSms(
  event: NotificationEvent,
  locale: Locale,
  audience: NotificationAudience,
  vars: TemplateVars,
  override?: SmsTemplate | null,
): string {
  const template = override ?? defaultTemplates(locale, audience, event).sms;
  return fillTemplate(template.body, vars).replace(/\s+$/g, "");
}
