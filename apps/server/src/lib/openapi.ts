import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiError as ApiErrorDto } from "@sitli/shared";
import type { Context } from "hono";
import type { AppEnv } from "../context.js";

export function createOpenAPIApp() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (result.success) return;
      const body: ApiErrorDto = {
        code: "validation_error",
        message: `Invalid ${result.target}`,
        issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      };
      return c.json(body, 400);
    },
  });
}

export const jsonBody = <T extends z.ZodType>(schema: T, description?: string) => ({
  content: { "application/json": { schema } },
  description,
  required: true,
});

export const jsonResponse = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

export const noContentResponse = { description: "No content" };

export const restaurantIdParam = z.object({ restaurantId: z.uuid() });
export const slugParam = z.object({ slug: z.string().min(1) });

export type AnyContext = Context<AppEnv>;
