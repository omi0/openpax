import type { NotificationProvider } from "../provider.js";
import { consoleEmailProvider, consoleSmsProvider } from "./console.js";
import { resendProvider } from "./resend.js";
import { smtpProvider } from "./smtp.js";
import { twilioProvider } from "./twilio.js";

/** Providers shipped with Sitli. Modules may add more via `providers` in defineModule. */
export const builtinProviders: NotificationProvider[] = [
  smtpProvider,
  resendProvider,
  consoleEmailProvider,
  twilioProvider,
  consoleSmsProvider,
];
