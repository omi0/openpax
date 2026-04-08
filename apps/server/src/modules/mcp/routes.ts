import { StreamableHTTPTransport } from "@hono/mcp";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { assistantsStatusDtoSchema } from "@sitli/shared";
import { bodyLimit } from "hono/body-limit";
import { assistantsSupported } from "../../auth/create-auth.js";
import { requireSession } from "../../auth/middleware.js";
import type { AppContext, AppEnv } from "../../context.js";
import { jsonResponse, noContentResponse } from "../../lib/openapi.js";
import { rateLimit } from "../../lib/rate-limit.js";
import { authenticateAssistant } from "./auth.js";
import { buildAssistantServer } from "./server.js";
import * as svc from "./service.js";

const tags = ["Assistants"];

export function mcpRoutes(app: OpenAPIHono<AppEnv>, ctx: AppContext) {
  if (assistantsSupported(ctx.env.PUBLIC_URL)) {
    // OAuth discovery documents (RFC 8414, RFC 9728) live at the origin root;
    // Better Auth answers them from the raw request, outside its base path.
    app.on(["GET", "HEAD"], "/.well-known/*", (c) => ctx.auth.handler(c.req.raw));

    const limits = { enabled: ctx.env.RATE_LIMIT === "on", trustProxy: ctx.env.TRUST_PROXY };
    app.use("/mcp", bodyLimit({ maxSize: 256 * 1024 }));
    app.use("/mcp", rateLimit(ctx.limiter, { name: "mcp", limit: 300, windowMs: 60_000 }, limits));
    app.all("/mcp", async (c) => {
      const auth = await authenticateAssistant(ctx, c.req.raw);
      if (!auth.ok) return auth.response;
      // Stateless: one server and transport per request, plain JSON answers.
      const server = await buildAssistantServer(ctx, auth.principal);
      const transport = new StreamableHTTPTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      try {
        const response = await transport.handleRequest(c);
        return response ?? c.body(null, 202);
      } finally {
        await transport.close();
        await server.close();
      }
    });
  } else {
    ctx.logger.warn(
      { publicUrl: ctx.env.PUBLIC_URL },
      "assistants (MCP) disabled: PUBLIC_URL must be HTTPS (or localhost)",
    );
  }

  app.openapi(
    createRoute({
      method: "get",
      path: "/api/v1/assistants",
      tags,
      summary:
        "Whether assistants can connect, the address to give them, and the current user's connections",
      middleware: [requireSession()] as const,
      responses: { 200: jsonResponse(assistantsStatusDtoSchema, "Assistants status") },
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) throw new Error("unreachable: requireSession");
      return c.json(await svc.assistantsStatus(ctx, user.id), 200);
    },
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/api/v1/assistants/connections/{connectionId}",
      tags,
      summary: "Disconnect an assistant: its tokens stop working at once",
      middleware: [requireSession()] as const,
      request: { params: z.object({ connectionId: z.uuid() }) },
      responses: { 204: noContentResponse },
    }),
    async (c) => {
      const user = c.get("user");
      if (!user) throw new Error("unreachable: requireSession");
      await svc.disconnectAssistant(ctx, user.id, c.req.valid("param").connectionId);
      return c.body(null, 204);
    },
  );
}
