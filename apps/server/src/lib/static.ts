import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import type { Logger } from "../logger.js";

export interface StaticDirs {
  dashboardDist?: string;
  widgetDist?: string;
}

const FRAME_ANY = "frame-ancestors *";

/**
 * Serve the built dashboard and widget from the API process:
 * - /embed.js and /widget/* come from the widget build, embeddable anywhere
 * - /book/* is the hosted widget page (iframe-friendly)
 * - everything else falls back to the dashboard SPA
 */
export function registerStatic(app: OpenAPIHono<AppEnv>, dirs: StaticDirs, logger: Logger) {
  const widgetIndex =
    dirs.widgetDist && existsSync(join(dirs.widgetDist, "index.html"))
      ? readFileSync(join(dirs.widgetDist, "index.html"), "utf8")
      : null;
  const dashboardIndex =
    dirs.dashboardDist && existsSync(join(dirs.dashboardDist, "index.html"))
      ? readFileSync(join(dirs.dashboardDist, "index.html"), "utf8")
      : null;

  if (dirs.widgetDist && widgetIndex) {
    const root = dirs.widgetDist;
    app.get(
      "/embed.js",
      serveStatic({
        root,
        rewriteRequestPath: () => "/embed.js",
        onFound: (_p, c) => c.header("Cache-Control", "public, max-age=300"),
      }),
    );
    app.get(
      "/widget/*",
      serveStatic({
        root,
        rewriteRequestPath: (p) => p.replace(/^\/widget/, ""),
        onFound: (p, c) =>
          c.header(
            "Cache-Control",
            p.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
          ),
      }),
    );
    app.get("/book/*", (c) => {
      c.header("Content-Security-Policy", FRAME_ANY);
      c.header("Cache-Control", "no-cache");
      return c.html(widgetIndex);
    });
    logger.info({ dir: root }, "serving widget");
  } else {
    logger.warn("widget build not found; /book and /embed.js are disabled");
  }

  if (dirs.dashboardDist && dashboardIndex) {
    const root = dirs.dashboardDist;
    app.get(
      "/assets/*",
      serveStatic({
        root,
        onFound: (_p, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
      }),
    );
    app.get("*", async (c, next) => {
      const path = c.req.path;
      if (path.startsWith("/api/") || path.startsWith("/widget/") || path.startsWith("/book/"))
        return next();
      if (/\.[a-z0-9]+$/i.test(path)) {
        // real files (favicon, manifest...) come from the dashboard build
        const res = await serveStatic({ root })(c, next);
        if (res) return res;
        return next();
      }
      c.header("X-Frame-Options", "DENY");
      c.header("Cache-Control", "no-cache");
      return c.html(dashboardIndex);
    });
    logger.info({ dir: root }, "serving dashboard");
  } else {
    logger.warn("dashboard build not found; only the API is served");
  }
}
