export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: Array<{ path: string; message: string }>,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(options.query ?? {}))
    if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data ?? {}) as {
      code?: string;
      message?: string;
      issues?: Array<{ path: string; message: string }>;
      reason?: string;
    };
    throw new ApiClientError(
      res.status,
      err.code ?? "http_error",
      err.message ?? res.statusText,
      err.issues,
      err.reason,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, query?: RequestOptions["query"]) =>
    apiFetch<T>(path, { method: "DELETE", query }),
};
