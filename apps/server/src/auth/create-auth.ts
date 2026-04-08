import { apiKey } from "@better-auth/api-key";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { mcp } from "@better-auth/mcp";
import type { Db } from "@sitli/db";
import * as schema from "@sitli/db/schema";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { jwt, organization } from "better-auth/plugins";
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

export interface PasswordResetEmailData {
  userId: string;
  email: string;
  name: string;
  url: string;
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
  sendResetPassword?: (data: PasswordResetEmailData) => Promise<void>;
}

/** How long a password reset link stays valid. */
export const RESET_PASSWORD_TTL_SECONDS = 60 * 60;

/**
 * Scopes an assistant (Claude, ChatGPT, any MCP client) can be granted.
 * `read` and `write` are Sitli's; the OIDC ones let clients ask for identity
 * and a refresh token. The consent page turns `write` off for a read-only
 * connection.
 */
export const ASSISTANT_SCOPES = ["openid", "profile", "email", "offline_access", "read", "write"];
export const ASSISTANT_LOGIN_PAGE = "/login";
export const ASSISTANT_CONSENT_PAGE = "/connect";
/** Refresh tokens keep a phone connected without logging in again. */
export const ASSISTANT_REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

/** The MCP endpoint assistants talk to; also the audience of the tokens issued for it. */
export const assistantResourceUrl = (baseURL: string) => `${baseURL}/mcp`;

/**
 * MCP tokens must be bound to an HTTPS resource; the plugin accepts plain
 * HTTP only on a loopback host (development, tests). Anything else boots
 * without the assistants feature instead of failing.
 */
export function assistantsSupported(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" ||
        url.hostname === "[::1]" ||
        /^127\.\d+\.\d+\.\d+$/.test(url.hostname))
    );
  } catch {
    return false;
  }
}

/**
 * MCP clients request the scopes the protected-resource metadata advertises,
 * and that document deliberately leaves out `offline_access`. Without it no
 * refresh token is issued and the owner would have to log in again every
 * hour, so every authorization request gets it added.
 */
const assistantRefreshTokens: BetterAuthPlugin = {
  id: "sitli-assistant-refresh-tokens",
  hooks: {
    before: [
      {
        matcher: (ctx) => ctx.path === "/oauth2/authorize",
        handler: createAuthMiddleware(async (ctx) => {
          const scope = ctx.query?.scope;
          if (typeof scope !== "string" || !scope) return;
          const scopes = scope.split(" ").filter(Boolean);
          if (scopes.includes("offline_access")) return;
          return {
            context: { query: { ...ctx.query, scope: [...scopes, "offline_access"].join(" ") } },
          };
        }),
      },
    ],
  },
};

export function createAuth(options: CreateAuthOptions) {
  const assistantPlugins = assistantsSupported(options.baseURL)
    ? [
        mcp({
          resource: assistantResourceUrl(options.baseURL),
          loginPage: ASSISTANT_LOGIN_PAGE,
          consentPage: ASSISTANT_CONSENT_PAGE,
          scopes: ASSISTANT_SCOPES,
          // Claude, ChatGPT and friends register themselves (RFC 7591) or
          // present a Client ID Metadata Document; nobody types client ids.
          allowDynamicClientRegistration: true,
          allowUnauthenticatedClientRegistration: true,
          refreshTokenExpiresIn: ASSISTANT_REFRESH_TOKEN_TTL_SECONDS,
        }),
        cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
        assistantRefreshTokens,
      ]
    : [];
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
      resetPasswordTokenExpiresIn: RESET_PASSWORD_TTL_SECONDS,
      sendResetPassword: async ({ user, url }) => {
        await options.sendResetPassword?.({
          userId: user.id,
          email: user.email,
          name: user.name,
          url,
        });
      },
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
      // signs the access tokens assistants present and serves /api/auth/jwks
      jwt(),
      ...assistantPlugins,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;
