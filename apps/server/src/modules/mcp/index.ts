import { defineModule } from "../module.js";
import { mcpRoutes } from "./routes.js";

/**
 * Assistants: an MCP server the owner connects Claude, ChatGPT or any other
 * MCP client to. Authentication is OAuth 2.1 (Better Auth is the authorization
 * server, see `auth/create-auth.ts`); the tools call the other modules' public
 * APIs with the connected user's role.
 */
export const mcpModule = defineModule({
  name: "mcp",
  routes: mcpRoutes,
});
