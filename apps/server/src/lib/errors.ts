import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Errors raised by route handlers and services that map straight to an HTTP response. */
export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static notFound(what = "Resource"): ApiError {
    return new ApiError(404, "not_found", `${what} not found`);
  }
  static forbidden(message = "You do not have permission to do this"): ApiError {
    return new ApiError(403, "forbidden", message);
  }
  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError(401, "unauthorized", message);
  }
  static badRequest(code: string, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(400, code, message, details);
  }
  static conflict(code: string, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(409, code, message, details);
  }
}
