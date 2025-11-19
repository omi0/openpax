import type { NotificationChannel, ProviderDescriptorDto, ProviderFieldDto } from "@sitli/shared";
import { z } from "zod";

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export type ProviderMessage<C extends NotificationChannel> = C extends "email"
  ? EmailMessage
  : SmsMessage;

export interface SendResult {
  providerMessageId?: string;
}

export type ProviderConfig = Record<string, string | number | boolean | null | undefined>;

export interface NotificationProvider<C extends NotificationChannel = NotificationChannel> {
  id: string;
  channel: C;
  label: string;
  description?: string;
  fields: ProviderFieldDto[];
  send(message: ProviderMessage<C>, config: ProviderConfig): Promise<SendResult>;
  /** Optional connectivity check that does not send anything (e.g. SMTP handshake). */
  verify?(config: ProviderConfig): Promise<void>;
}

export function defineProvider<C extends NotificationChannel>(
  p: NotificationProvider<C>,
): NotificationProvider<C> {
  return p;
}

/** Build the validation schema of a provider's config from its field list. */
export function configSchemaFor(
  provider: NotificationProvider,
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const f of provider.fields) {
    let s: z.ZodType;
    switch (f.type) {
      case "number":
        s = z.coerce.number();
        break;
      case "boolean":
        s = z.boolean();
        break;
      case "select":
        s = z.enum((f.options ?? []).map((o) => o.value) as [string, ...string[]]);
        break;
      case "email":
        s = z.string().trim().min(1);
        break;
      default:
        s = z.string().trim().min(1);
    }
    shape[f.key] = f.required ? s : s.nullable().optional();
  }
  return z.object(shape);
}

export function describeProvider(provider: NotificationProvider): ProviderDescriptorDto {
  return {
    id: provider.id,
    channel: provider.channel,
    label: provider.label,
    description: provider.description,
    fields: provider.fields,
    supportsTest: true,
  };
}

export class ProviderRegistry {
  private byId = new Map<string, NotificationProvider>();

  register(providers: NotificationProvider[]) {
    for (const p of providers) {
      if (this.byId.has(p.id)) throw new Error(`Duplicate notification provider id: ${p.id}`);
      this.byId.set(p.id, p);
    }
  }

  get(id: string): NotificationProvider | undefined {
    return this.byId.get(id);
  }

  list(channel?: NotificationChannel): NotificationProvider[] {
    return [...this.byId.values()].filter((p) => !channel || p.channel === channel);
  }
}
