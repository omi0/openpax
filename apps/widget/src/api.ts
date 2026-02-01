import type {
  AvailabilityResponse,
  MonthAvailabilityResponse,
  PublicBookingDto,
  PublicWaitlistEntryDto,
  PublicWidgetConfigDto,
} from "@sitli/shared";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
  }
}

/** The widget is served by the API itself, so requests are same-origin; the embed passes the origin explicitly. */
export const apiBase = signalOrigin();

function signalOrigin(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("api");
  return (fromQuery ?? window.location.origin).replace(/\/+$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let body: { code?: string; message?: string; reason?: string } = {};
    try {
      body = await res.json();
    } catch {}
    throw new ApiRequestError(
      res.status,
      body.code ?? "http_error",
      body.message ?? res.statusText,
      body.reason,
    );
  }
  return res.json() as Promise<T>;
}

export const api = {
  config: (slug: string) =>
    request<PublicWidgetConfigDto>(
      `/api/public/v1/restaurants/${encodeURIComponent(slug)}/widget-config`,
    ),
  month: (slug: string, month: string) =>
    request<MonthAvailabilityResponse>(
      `/api/public/v1/restaurants/${encodeURIComponent(slug)}/availability/month?month=${month}`,
    ),
  availability: (slug: string, date: string, partySize: number) =>
    request<AvailabilityResponse>(
      `/api/public/v1/restaurants/${encodeURIComponent(slug)}/availability?date=${date}&partySize=${partySize}`,
    ),
  book: (slug: string, body: unknown) =>
    request<PublicBookingDto>(`/api/public/v1/restaurants/${encodeURIComponent(slug)}/bookings`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  lookup: (token: string) =>
    request<PublicBookingDto>(`/api/public/v1/bookings/${encodeURIComponent(token)}`),
  cancel: (token: string) =>
    request<PublicBookingDto>(`/api/public/v1/bookings/${encodeURIComponent(token)}/cancel`, {
      method: "POST",
      body: "{}",
    }),
  joinWaitlist: (slug: string, body: unknown) =>
    request<PublicWaitlistEntryDto>(
      `/api/public/v1/restaurants/${encodeURIComponent(slug)}/waitlist`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  waitlist: (token: string) =>
    request<PublicWaitlistEntryDto>(`/api/public/v1/waitlist/${encodeURIComponent(token)}`),
  acceptWaitlist: (token: string) =>
    request<PublicBookingDto>(`/api/public/v1/waitlist/${encodeURIComponent(token)}/accept`, {
      method: "POST",
      body: "{}",
    }),
  leaveWaitlist: (token: string) =>
    request<PublicWaitlistEntryDto>(`/api/public/v1/waitlist/${encodeURIComponent(token)}/leave`, {
      method: "POST",
      body: "{}",
    }),
};
