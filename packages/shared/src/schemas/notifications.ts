import { z } from "zod";
import { idSchema, instantSchema, localeSchema } from "./common.js";

export const NOTIFICATION_CHANNELS = ["email", "sms"] as const;
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_EVENTS = [
  "booking.confirmed",
  "booking.pending",
  "booking.cancelled",
  "booking.modified",
  "booking.reminder",
  "waitlist.joined",
  "waitlist.offered",
  "booking.payment_required",
] as const;
export const notificationEventSchema = z.enum(NOTIFICATION_EVENTS);
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_AUDIENCES = ["guest", "restaurant"] as const;
export const notificationAudienceSchema = z.enum(NOTIFICATION_AUDIENCES);
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const notificationSettingDtoSchema = z.object({
  event: notificationEventSchema,
  channel: notificationChannelSchema,
  audience: notificationAudienceSchema,
  enabled: z.boolean(),
  /** Reminder only: minutes before arrival. */
  offsetMinutes: z
    .number()
    .int()
    .min(15)
    .max(60 * 24 * 7)
    .nullable(),
});
export type NotificationSettingDto = z.infer<typeof notificationSettingDtoSchema>;

export const updateNotificationSettingsInputSchema = z.object({
  settings: z.array(notificationSettingDtoSchema).max(100),
});
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsInputSchema>;

export const providerFieldDtoSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "password", "number", "boolean", "select", "email"]),
  required: z.boolean(),
  secret: z.boolean(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
});
export type ProviderFieldDto = z.infer<typeof providerFieldDtoSchema>;

export const providerDescriptorDtoSchema = z.object({
  id: z.string(),
  channel: notificationChannelSchema,
  label: z.string(),
  description: z.string().optional(),
  fields: z.array(providerFieldDtoSchema),
  supportsTest: z.boolean(),
});
export type ProviderDescriptorDto = z.infer<typeof providerDescriptorDtoSchema>;

/** A secret as returned by the API: never the value itself. */
export const maskedSecretSchema = z.object({ set: z.boolean(), last4: z.string().optional() });
export const providerConfigValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  maskedSecretSchema,
]);

export const providerConfigDtoSchema = z.object({
  channel: notificationChannelSchema,
  providerId: z.string().nullable(),
  enabled: z.boolean(),
  /** Where the active configuration comes from. */
  scope: z.enum(["restaurant", "organization", "instance", "none"]),
  config: z.record(z.string(), providerConfigValueSchema),
  updatedAt: instantSchema.nullable(),
});
export type ProviderConfigDto = z.infer<typeof providerConfigDtoSchema>;

export const upsertProviderConfigInputSchema = z.object({
  providerId: z.string().min(1).max(50),
  enabled: z.boolean().default(true),
  /** Validated on the server against the provider's own schema; omitted secrets are kept. */
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  /** Save for the whole organization instead of just this restaurant. */
  scope: z.enum(["restaurant", "organization"]).default("restaurant"),
});
export type UpsertProviderConfigInput = z.infer<typeof upsertProviderConfigInputSchema>;

export const testProviderInputSchema = z.object({
  /** Email address or phone number depending on the channel. */
  to: z.string().trim().min(3).max(254),
});
export type TestProviderInput = z.infer<typeof testProviderInputSchema>;

export const notificationLogDtoSchema = z.object({
  id: idSchema,
  bookingId: idSchema.nullable(),
  event: z.string(),
  channel: notificationChannelSchema,
  audience: notificationAudienceSchema,
  providerId: z.string().nullable(),
  recipient: z.string(),
  status: z.enum(["queued", "sent", "failed", "skipped"]),
  error: z.string().nullable(),
  sentAt: instantSchema.nullable(),
  createdAt: instantSchema,
});
export type NotificationLogDto = z.infer<typeof notificationLogDtoSchema>;

export const notificationTemplateDtoSchema = z.object({
  event: notificationEventSchema,
  channel: notificationChannelSchema,
  audience: notificationAudienceSchema,
  locale: localeSchema,
  /** Email only. */
  subject: z.string().nullable(),
  /** Email only. */
  heading: z.string().nullable(),
  body: z.string(),
  /** true when the restaurant saved its own text instead of the default. */
  custom: z.boolean(),
  updatedAt: instantSchema.nullable(),
});
export type NotificationTemplateDto = z.infer<typeof notificationTemplateDtoSchema>;

export const upsertNotificationTemplateInputSchema = z.object({
  event: notificationEventSchema,
  channel: notificationChannelSchema,
  audience: notificationAudienceSchema,
  locale: localeSchema,
  subject: z.string().trim().max(200).nullable().optional(),
  heading: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().min(1).max(4000),
});
export type UpsertNotificationTemplateInput = z.infer<typeof upsertNotificationTemplateInputSchema>;

export const notificationTemplatePreviewSchema = z.object({
  subject: z.string().nullable(),
  html: z.string().nullable(),
  text: z.string(),
});
export type NotificationTemplatePreview = z.infer<typeof notificationTemplatePreviewSchema>;
