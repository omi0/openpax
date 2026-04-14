import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from "@openpax/db";
import type { AssistantConnectionDto, AssistantsStatusDto } from "@openpax/shared";
import { and, desc, eq, isNull } from "drizzle-orm";
import { assistantResourceUrl, assistantsSupported } from "../../auth/create-auth.js";
import type { AppContext } from "../../context.js";
import { writeAudit } from "../../lib/audit.js";
import { ApiError } from "../../lib/errors.js";

/** The settings page: is the feature on, where to point the assistant, what this user connected. */
export async function assistantsStatus(
  ctx: AppContext,
  userId: string,
): Promise<AssistantsStatusDto> {
  const enabled = assistantsSupported(ctx.env.PUBLIC_URL);
  const rows = await ctx.db
    .select({
      id: oauthConsent.id,
      clientId: oauthConsent.clientId,
      scopes: oauthConsent.scopes,
      createdAt: oauthConsent.createdAt,
      updatedAt: oauthConsent.updatedAt,
      clientName: oauthClient.name,
      clientUri: oauthClient.uri,
    })
    .from(oauthConsent)
    .leftJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.createdAt));
  const connections: AssistantConnectionDto[] = rows
    .filter((r): r is typeof r & { clientId: string } => !!r.clientId)
    .map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName ?? null,
      clientUri: r.clientUri ?? null,
      canWrite: r.scopes.includes("write"),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  return { enabled, url: enabled ? assistantResourceUrl(ctx.env.PUBLIC_URL) : null, connections };
}

/**
 * Disconnect an assistant: drop the consent (the MCP endpoint checks it on
 * every call, so access stops at once) and revoke the tokens it still holds.
 */
export async function disconnectAssistant(
  ctx: AppContext,
  userId: string,
  consentId: string,
): Promise<void> {
  const [consent] = await ctx.db
    .select({ id: oauthConsent.id, clientId: oauthConsent.clientId })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.id, consentId), eq(oauthConsent.userId, userId)))
    .limit(1);
  if (!consent?.clientId) throw ApiError.notFound("Connection");
  const clientId = consent.clientId;
  const now = ctx.now();
  await ctx.db.transaction(async (tx) => {
    await tx.delete(oauthConsent).where(eq(oauthConsent.id, consent.id));
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthRefreshToken.userId, userId),
          eq(oauthRefreshToken.clientId, clientId),
          isNull(oauthRefreshToken.revoked),
        ),
      );
    await tx
      .update(oauthAccessToken)
      .set({ revoked: now })
      .where(
        and(
          eq(oauthAccessToken.userId, userId),
          eq(oauthAccessToken.clientId, clientId),
          isNull(oauthAccessToken.revoked),
        ),
      );
    await writeAudit(tx, {
      restaurantId: null,
      actor: { type: "user", id: userId, role: "staff" },
      action: "assistant.disconnected",
      entityType: "oauth_consent",
      entityId: consent.id,
      data: { clientId },
    });
  });
}
