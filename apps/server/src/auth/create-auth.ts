import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { Db } from "@sitli/db";
import * as schema from "@sitli/db/schema";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins";
import { ac, roles } from "./access.js";
import { type SignupMode, signupAllowed } from "./signup.js";

export interface InvitationEmailData {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
}

export interface CreateAuthOptions {
  db: Db;
  baseURL: string;
  secret: string;
  trustedOrigins?: string[];
  /** Force secure cookies even outside NODE_ENV=production (behind TLS proxies). */
  secureCookies?: boolean;
  /** Honour X-Forwarded-Host/Proto from a reverse proxy. */
  trustProxy?: boolean;
  /** Defaults to "open" so the CLI and tests are unaffected; the server passes SIGNUP_MODE. */
  signupMode?: SignupMode;
  sendInvitationEmail?: (data: InvitationEmailData) => Promise<void>;
}

export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    appName: "Sitli",
    baseURL: options.baseURL,
    basePath: "/api/auth",
    secret: options.secret,
    trustedOrigins: options.trustedOrigins ?? [],
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (await signupAllowed(options.db, options.signupMode ?? "open", user.email)) return;
            throw new APIError("FORBIDDEN", {
              code: "SIGNUP_CLOSED",
              message: "Sign-up is closed on this instance. Ask an owner for an invitation.",
            });
          },
        },
      },
    },
    advanced: {
      useSecureCookies: options.secureCookies,
      trustedProxyHeaders: options.trustProxy,
      database: { generateId: "uuid" },
    },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "owner",
        allowUserToCreateOrganization: true,
        sendInvitationEmail: async (data) => {
          await options.sendInvitationEmail?.({
            id: data.id,
            email: data.email,
            role: data.role,
            organizationId: data.organization.id,
            organizationName: data.organization.name,
            inviterName: data.inviter.user.name,
            inviterEmail: data.inviter.user.email,
          });
        },
      }),
      apiKey({
        references: "organization",
        defaultPrefix: "sitli_",
        enableMetadata: true,
        rateLimit: { enabled: false },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
