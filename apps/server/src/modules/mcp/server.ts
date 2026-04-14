import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DomainError, SlotUnavailableError, todayIn } from "@openpax/core";
import { user } from "@openpax/db";
import type { RestaurantSummaryDto } from "@openpax/shared";
import { eq } from "drizzle-orm";
import { type Permissions, type RoleName, roleHasPermission, roles } from "../../auth/access.js";
import type { Actor, AppContext, RestaurantRow } from "../../context.js";
import { ApiError } from "../../lib/errors.js";
import { findRestaurantById } from "../../lib/restaurant-lookup.js";
import { listRestaurantsForUser } from "../restaurants/index.js";
import type { AssistantPrincipal } from "./auth.js";
import { ASSISTANT_TOOLS, type AssistantTool, ToolError } from "./tools.js";

/** What a tool call gets besides its arguments. */
export interface ToolContext {
  ctx: AppContext;
  principal: AssistantPrincipal;
  restaurants: RestaurantSummaryDto[];
  /**
   * The restaurant a call targets (the only one, or the one named) and the
   * actor to act as. Throws a readable error when the role does not allow it.
   */
  restaurant(
    restaurantId: string | undefined,
    permissions: Permissions,
  ): Promise<{ row: RestaurantRow; actor: Actor; role: RoleName }>;
}

const SERVER_INFO = { name: "openpax", version: "1" };

function pick(restaurants: RestaurantSummaryDto[], restaurantId: string | undefined) {
  if (restaurantId) {
    const found = restaurants.find((r) => r.id === restaurantId);
    if (!found) throw new ToolError("No restaurant with that id is connected to this account.");
    return found;
  }
  const [only] = restaurants;
  if (only && restaurants.length === 1) return only;
  if (!only) throw new ToolError("This account has no restaurant yet.");
  throw new ToolError(
    `Several restaurants are connected; pass restaurantId. ${restaurants
      .map((r) => `${r.name}: ${r.id}`)
      .join("; ")}`,
  );
}

function instructions(
  ctx: AppContext,
  who: { name: string; email: string } | null,
  restaurants: RestaurantSummaryDto[],
  canWrite: boolean,
) {
  const lines = [
    "OpenPax is the restaurant's booking system: bookings, guests, waitlist, opening hours, closures and figures.",
    who
      ? `Connected as ${who.name} (${who.email}).`
      : "Connected as a member of the restaurant's team.",
    restaurants.length === 0
      ? "This account has no restaurant yet."
      : `Restaurant${restaurants.length > 1 ? "s" : ""}: ${restaurants
          .map(
            (r) =>
              `${r.name} (id ${r.id}, time zone ${r.timezone}, your role: ${r.role}, today there is ${todayIn(r.timezone, ctx.now())})`,
          )
          .join("; ")}.`,
    "Dates are YYYY-MM-DD and times HH:MM on the 24-hour clock in the restaurant's time zone (8pm is 20:00). Party size means number of guests (covers).",
    canWrite
      ? "You may create and change bookings, add guest notes, close days and offer waitlist spots. Before cancelling a booking, marking a no-show or closing days, make sure the user really asked for it. Bookings you create are recorded as made by the assistant; the guest gets the usual confirmation unless notifyGuest is false."
      : "This connection is read-only: you can look things up but not change them. To allow changes, the owner reconnects the assistant from Settings → Assistants and keeps 'allow changes' on.",
    "When a slot is not available the answer says why (full, closed, no table, outside hours). Suggest the nearest free times from check_availability instead of guessing.",
  ];
  return lines.join("\n");
}

function errorText(error: unknown): string {
  if (error instanceof ToolError) return error.message;
  if (error instanceof SlotUnavailableError)
    return `Not available: ${error.reason}. ${error.message}`;
  if (error instanceof ApiError) return error.message;
  if (error instanceof DomainError) return error.message;
  if (error instanceof Error && error.name === "ZodError")
    return `Invalid arguments: ${error.message}`;
  return "Something went wrong on the server";
}

const result = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

/**
 * One server per request: it is stateless, cheap to build, and lets the tool
 * list reflect the caller (read-only connections and staff members do not
 * even see the tools they cannot use).
 */
export async function buildAssistantServer(
  ctx: AppContext,
  principal: AssistantPrincipal,
): Promise<McpServer> {
  const [restaurants, [who]] = await Promise.all([
    listRestaurantsForUser(ctx, principal.userId),
    ctx.db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, principal.userId))
      .limit(1),
  ]);
  const canWrite = principal.scopes.includes("write");
  const cache = new Map<string, Promise<RestaurantRow>>();

  const tc: ToolContext = {
    ctx,
    principal,
    restaurants,
    async restaurant(restaurantId, permissions) {
      const summary = pick(restaurants, restaurantId);
      const role = (summary.role in roles ? summary.role : "staff") as RoleName;
      if (!roleHasPermission(role, permissions))
        throw new ToolError(`Your role (${role}) is not allowed to do this in ${summary.name}.`);
      let rowPromise = cache.get(summary.id);
      if (!rowPromise) {
        rowPromise = findRestaurantById(ctx, summary.id);
        cache.set(summary.id, rowPromise);
      }
      const row = await rowPromise;
      return { row, role, actor: { type: "user", id: principal.userId, role, via: "assistant" } };
    },
  };

  const server = new McpServer(SERVER_INFO, {
    instructions: instructions(ctx, who ?? null, restaurants, canWrite),
  });
  for (const tool of ASSISTANT_TOOLS) {
    if (tool.scope === "write" && !canWrite) continue;
    if (!restaurants.some((r) => roleHasPermission(r.role, tool.permissions))) continue;
    registerTool(server, tool, tc);
  }
  return server;
}

function registerTool(server: McpServer, tool: AssistantTool, tc: ToolContext) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      annotations: tool.annotations,
    },
    async (args: Record<string, unknown>) => {
      try {
        return result(await tool.run(args, tc));
      } catch (error) {
        if (
          !(error instanceof ToolError) &&
          !(error instanceof ApiError) &&
          !(error instanceof DomainError) &&
          !(error instanceof SlotUnavailableError)
        )
          tc.ctx.logger.error({ err: error, tool: tool.name }, "assistant tool failed");
        return { content: [{ type: "text", text: errorText(error) }], isError: true };
      }
    },
  );
}
