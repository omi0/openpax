import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppContext, AppEnv } from "../context.js";
import type { AnyEventHandler } from "../events/dispatch.js";
import type { AnyJobDef } from "../jobs/queue.js";
import type { NotificationProvider } from "../notifications/provider.js";

/**
 * A module is a self-contained feature: it mounts routes, owns background
 * jobs, reacts to domain events and can contribute notification providers.
 * Modules never import each other's internals; they talk through events.
 */
export interface SitliModule {
  name: string;
  routes?: (app: OpenAPIHono<AppEnv>, ctx: AppContext) => void;
  jobs?: AnyJobDef[];
  eventHandlers?: AnyEventHandler[];
  providers?: NotificationProvider[];
}

export const defineModule = (module: SitliModule): SitliModule => module;
