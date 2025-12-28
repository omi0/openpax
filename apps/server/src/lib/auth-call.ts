import { APIError } from "better-auth/api";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ApiError } from "./errors.js";

/** Run a Better Auth server API call and translate its errors into ours. */
export async function callAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof APIError) {
      const status = (
        typeof error.statusCode === "number" ? error.statusCode : 400
      ) as ContentfulStatusCode;
      const body = (error.body ?? {}) as { code?: string; message?: string };
      throw new ApiError(
        status,
        (body.code ?? "auth_error").toLowerCase(),
        body.message ?? error.message,
      );
    }
    throw error;
  }
}
