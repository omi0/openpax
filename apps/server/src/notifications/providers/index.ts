import type { NotificationProvider } from "../provider.js";
import { consoleEmailProvider, consoleSmsProvider } from "./console.js";
import { postmarkProvider } from "./postmark.js";
import { resendProvider } from "./resend.js";
import { sendgridProvider } from "./sendgrid.js";
import { sesProvider } from "./ses.js";
import { smtpProvider } from "./smtp.js";
import { twilioProvider } from "./twilio.js";
import { vonageProvider } from "./vonage.js";

/** Providers shipped with OpenPax. Modules may add more via `providers` in defineModule. */
export const builtinProviders: NotificationProvider[] = [
  smtpProvider,
  resendProvider,
  sendgridProvider,
  postmarkProvider,
  sesProvider,
  consoleEmailProvider,
  twilioProvider,
  vonageProvider,
  consoleSmsProvider,
];
