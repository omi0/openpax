import { member, restaurant } from "@openpax/db";
import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { AppContext, AppEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import { type Permissions, type RoleName, roleHasPermission, roles } from "./access.js";

/** Attach the Better Auth session (if any) without requiring it. */
export function attachSession(ctx: AppContext) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const result = await ctx.auth.api.getSession({ headers: c.req.raw.headers });
    c.set("session", result?.session ?? null);
    c.set("user", result?.user ?? null);
    await next();
  });
}

export function requireSession() {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get("user")) throw ApiError.unauthorized();
    await next();
  });
}

/**
 * Resolve `:restaurantId`, verify the caller belongs to its organization
 * (as a member or through an organization API key) and holds `permissions`.
 */
export function requireRestaurant(ctx: AppContext, permissions?: Permissions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const restaurantId = c.req.param("restaurantId");
    if (!restaurantId) throw ApiError.badRequest("missing_restaurant", "restaurantId is required");

    const [row] = await ctx.db
      .select()
      .from(restaurant)
      .where(eq(restaurant.id, restaurantId))
      .limit(1);
    if (!row) throw ApiError.notFound("Restaurant");

    const apiKeyHeader = c.req.header("x-api-key");
    if (apiKeyHeader) {
      const verified = await ctx.auth.api.verifyApiKey({ body: { key: apiKeyHeader } });
      if (!verified.valid || !verified.key) throw ApiError.unauthorized("Invalid API key");
      if (verified.key.referenceId !== row.organizationId) throw ApiError.forbidden();
      const role: RoleName = "manager";
      if (permissions && !roleHasPermission(role, permissions)) throw ApiError.forbidden();
      c.set("restaurant", row);
      c.set("actor", {
        type: "api_key",
        id: verified.key.id,
        organizationId: row.organizationId,
        role,
      });
      await next();
      return;
    }

    const user = c.get("user");
    if (!user) throw ApiError.unauthorized();
    const [membership] = await ctx.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.userId, user.id), eq(member.organizationId, row.organizationId)))
      .limit(1);
    if (!membership)
      throw ApiError.forbidden("You are not a member of this restaurant's organization");
    const role = (membership.role in roles ? membership.role : "staff") as RoleName;
    if (permissions && !roleHasPermission(role, permissions)) throw ApiError.forbidden();

    c.set("restaurant", row);
    c.set("actor", { type: "user", id: user.id, role });
    await next();
  });
}
