import { oauthConsent } from "@openpax/db";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";
import { ASSISTANT_SCOPES, assistantResourceUrl } from "../../auth/create-auth.js";
import type { AppContext } from "../../context.js";

/** Who is calling the MCP server: the user who authorized the assistant, and what they allowed. */
export interface AssistantPrincipal {
  userId: string;
  clientId: string;
  scopes: string[];
}

export type AssistantAuth =
  | { ok: true; principal: AssistantPrincipal }
  | { ok: false; response: Response };

/** Stable key so the verifier caches the JWKS across requests. */
const JWKS_CACHE_KEY = {};

let issuerPromise: Promise<string> | null = null;
/** The token issuer is Better Auth's base URL (PUBLIC_URL + /api/auth). */
const issuerOf = (ctx: AppContext) => {
  issuerPromise ??= ctx.auth.$context.then((c) => c.baseURL);
  return issuerPromise;
};

/**
 * An RFC 9728 challenge: it tells the client where the protected-resource
 * metadata lives so it can discover the authorization server and start the
 * OAuth flow. The scopes named are the ones a fresh authorization should ask for.
 */
function challenge(ctx: AppContext, status: 401 | 403, error: string, description: string) {
  const resource = assistantResourceUrl(ctx.env.PUBLIC_URL);
  const metadata = `${ctx.env.PUBLIC_URL}/.well-known/oauth-protected-resource${new URL(resource).pathname}`;
  const scope = ASSISTANT_SCOPES.filter((s) => s !== "openid" && s !== "profile" && s !== "email");
  // header values are byte strings: keep the description plain ASCII
  const plain = description.replace(/"/g, "'").replace(/[^\x20-\x7e]/g, "-");
  const header = [
    `Bearer resource_metadata="${metadata}"`,
    `error="${error}"`,
    `error_description="${plain}"`,
    `scope="${scope.join(" ")}"`,
  ].join(", ");
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: description }, id: null }),
    {
      status,
      headers: { "content-type": "application/json", "www-authenticate": header },
    },
  );
}

/**
 * Verify the bearer token an MCP client presents. Tokens are JWTs signed by
 * this instance (the `jwt` plugin), so the check is local: signature against
 * our own JWKS, issuer, audience (the MCP resource), expiry. On top of that
 * the connection must still exist: revoking it from Settings → Assistants
 * deletes the consent row and cuts the assistant off at once instead of when
 * the token expires.
 */
export async function authenticateAssistant(
  ctx: AppContext,
  request: Request,
): Promise<AssistantAuth> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match)
    return {
      ok: false,
      response: challenge(
        ctx,
        401,
        "invalid_request",
        "Sign in with an assistant that supports OAuth to use this server",
      ),
    };
  const token = match[1] as string;

  let claims: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
  try {
    claims = await verifyJwsAccessToken(token, {
      jwksFetch: async () => ctx.auth.api.getJwks(),
      jwksCacheKey: JWKS_CACHE_KEY,
      verifyOptions: {
        issuer: await issuerOf(ctx),
        audience: assistantResourceUrl(ctx.env.PUBLIC_URL),
      },
    });
  } catch (error) {
    ctx.logger.debug({ err: error }, "assistant token rejected");
    return {
      ok: false,
      response: challenge(ctx, 401, "invalid_token", "The access token is invalid or has expired"),
    };
  }
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  const clientId =
    typeof claims.client_id === "string"
      ? claims.client_id
      : typeof claims.azp === "string"
        ? claims.azp
        : null;
  if (!userId || !clientId)
    return {
      ok: false,
      response: challenge(ctx, 401, "invalid_token", "The access token is not bound to a user"),
    };
  const scopes = typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [];

  const [consent] = await ctx.db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
    .limit(1);
  if (!consent)
    return {
      ok: false,
      response: challenge(
        ctx,
        401,
        "invalid_token",
        "This assistant was disconnected; connect it again from Settings, Assistants",
      ),
    };

  return { ok: true, principal: { userId, clientId, scopes } };
}
