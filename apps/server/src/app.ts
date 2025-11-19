import type { OpenAPIHono } from "@hono/zod-openapi";
import { DomainError, SlotUnavailableError } from "@sitli/core";
import type { ApiError as ApiErrorDto } from "@sitli/shared";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { attachSession } from "./auth/middleware.js";
import type { AppContext, AppEnv } from "./context.js";
import { ApiError } from "./lib/errors.js";
import { createOpenAPIApp } from "./lib/openapi.js";
import { registerStatic, type StaticDirs } from "./lib/static.js";
import type { SitliModule } from "./modules/module.js";

export interface CreateAppOptions {
  static?: StaticDirs;
}

export function createApp(
  ctx: AppContext,
  modules: SitliModule[],
  options: CreateAppOptions = {},
): OpenAPIHono<AppEnv> {
  const app = createOpenAPIApp();

  app.use(requestId());
  app.use("/api/*", bodyLimit({ maxSize: 1024 * 1024 }));
  app.use("/api/*", async (c, next) => {
    const start = Date.now();
    await next();
    ctx.logger.debug(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - start,
        requestId: c.get("requestId"),
      },
      "request",
    );
  });

  // The widget runs on restaurant websites: open CORS, no credentials.
  app.use(
    "/api/public/*",
    cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], maxAge: 600 }),
  );
  // Dashboard and auth: same origin in production, the Vite dev server in development.
  const dashboardOrigins = [ctx.env.PUBLIC_URL, ctx.env.DASHBOARD_ORIGIN].filter(
    (v): v is string => !!v,
  );
  const credentialed = cors({
    origin: (origin) => (dashboardOrigins.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "X-Api-Key"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  app.use("/api/auth/*", credentialed);
  app.use("/api/v1/*", credentialed);

  app.on(["GET", "POST"], "/api/auth/*", (c) => ctx.auth.handler(c.req.raw));

  app.use("/api/v1/*", attachSession(ctx));
  app.use("/api/*", async (c, next) => {
    c.set("actor", { type: "guest", id: null });
    await next();
  });

  for (const m of modules) m.routes?.(app, ctx);

  app.doc("/api/openapi.json", {
    openapi: "3.0.0",
    info: {
      title: "Sitli API",
      version: "1",
      description: "Restaurant bookings: public widget endpoints and the staff API.",
    },
    servers: [{ url: ctx.env.PUBLIC_URL }],
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "ApiKey", {
    type: "apiKey",
    in: "header",
    name: "X-Api-Key",
  });
  app.openAPIRegistry.registerComponent("securitySchemes", "Session", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.notFound((c) => {
    if (c.req.path.startsWith("/api/"))
      return c.json({ code: "not_found", message: "Route not found" } satisfies ApiErrorDto, 404);
    return c.text("Not found", 404);
  });

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(
        { code: error.code, message: error.message, ...(error.details ?? {}) },
        error.status,
      );
    }
    if (error instanceof HTTPException) {
      return c.json(
        { code: "http_error", message: error.message } satisfies ApiErrorDto,
        error.status,
      );
    }
    if (error instanceof SlotUnavailableError) {
      return c.json(
        { code: "slot_unavailable", message: error.message, reason: error.reason },
        409,
      );
    }
    if (error instanceof DomainError) {
      const status =
        error.code === "not_found"
          ? 404
          : error.code === "invalid_transition"
            ? 409
            : error.code === "policy_violation"
              ? 422
              : 400;
      return c.json({ code: error.code, message: error.message, ...(error.details ?? {}) }, status);
    }
    ctx.logger.error(
      { err: error, path: c.req.path, requestId: c.get("requestId") },
      "unhandled error",
    );
    const detail =
      ctx.env.NODE_ENV === "production"
        ? undefined
        : error instanceof Error
          ? error.message
          : String(error);
    return c.json(
      { code: "internal_error", message: "Something went wrong", ...(detail ? { detail } : {}) },
      500,
    );
  });

  if (options.static) registerStatic(app, options.static, ctx.logger);
  return app;
}
