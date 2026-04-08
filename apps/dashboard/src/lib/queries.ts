import type {
  AnalyticsDto,
  ApiKeyDto,
  AreaDto,
  AssistantsStatusDto,
  AvailabilityResponse,
  BookingDto,
  BookingPolicyDto,
  CapacityRuleDto,
  CustomerDto,
  CustomerDuplicateDto,
  CustomerSort,
  CustomerTagDto,
  FeedbackDto,
  FeedbackSummaryDto,
  NotificationChannel,
  NotificationLogDto,
  NotificationSettingDto,
  NotificationTemplateDto,
  PaymentConfigDto,
  ProviderConfigDto,
  ProviderDescriptorDto,
  PublicInvitationDto,
  RestaurantDto,
  RestaurantSummaryDto,
  ScheduleExceptionDto,
  ServiceDto,
  SetupStatusDto,
  TableDto,
  TeamDto,
  WaitlistEntryDto,
  WidgetConfigDto,
} from "@sitli/shared";
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api.js";

export interface Me {
  user: { id: string; name: string; email: string };
  restaurants: RestaurantSummaryDto[];
}

export const meQuery = () =>
  queryOptions({ queryKey: ["me"], queryFn: () => api.get<Me>("/api/v1/me"), staleTime: 30_000 });

export const restaurantQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id],
    queryFn: () => api.get<RestaurantDto>(`/api/v1/restaurants/${id}`),
    staleTime: 60_000,
  });

export const servicesQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "services"],
    queryFn: () => api.get<ServiceDto[]>(`/api/v1/restaurants/${id}/services`),
  });

export const areasQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "areas"],
    queryFn: () => api.get<AreaDto[]>(`/api/v1/restaurants/${id}/areas`),
  });

export const exceptionsQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "schedule-exceptions"],
    queryFn: () => api.get<ScheduleExceptionDto[]>(`/api/v1/restaurants/${id}/schedule-exceptions`),
  });

export const capacityRulesQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "capacity-rules"],
    queryFn: () => api.get<CapacityRuleDto[]>(`/api/v1/restaurants/${id}/capacity-rules`),
  });

export const policyQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "policy"],
    queryFn: () => api.get<BookingPolicyDto>(`/api/v1/restaurants/${id}/policy`),
  });

export const setupQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "setup"],
    queryFn: () => api.get<SetupStatusDto>(`/api/v1/restaurants/${id}/setup`),
    staleTime: 10_000,
  });

export const widgetConfigQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "widget"],
    queryFn: () => api.get<WidgetConfigDto>(`/api/v1/restaurants/${id}/widget-config`),
  });

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const bookingsQuery = (id: string, date: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "bookings", date],
    queryFn: () =>
      api.get<Paginated<BookingDto>>(`/api/v1/restaurants/${id}/bookings`, { date, pageSize: 200 }),
    refetchInterval: 30_000,
  });

export interface CustomersParams {
  search?: string;
  tag?: string;
  sort?: CustomerSort;
  page?: number;
}

export const customersQuery = (id: string, params: CustomersParams) =>
  queryOptions({
    queryKey: ["restaurant", id, "customers", params],
    queryFn: () =>
      api.get<Paginated<CustomerDto>>(`/api/v1/restaurants/${id}/customers`, {
        search: params.search || undefined,
        tag: params.tag || undefined,
        sort: params.sort,
        page: params.page,
        pageSize: 50,
      }),
    placeholderData: (prev) => prev,
  });

export const customerQuery = (id: string, customerId: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "customers", customerId],
    queryFn: () => api.get<CustomerDto>(`/api/v1/restaurants/${id}/customers/${customerId}`),
  });

export const customerDuplicatesQuery = (id: string, customerId: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "customers", customerId, "duplicates"],
    queryFn: () =>
      api.get<CustomerDuplicateDto[]>(
        `/api/v1/restaurants/${id}/customers/${customerId}/duplicates`,
      ),
  });

export const customerTagsQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "customer-tags"],
    queryFn: () => api.get<CustomerTagDto[]>(`/api/v1/restaurants/${id}/customers/tags`),
    staleTime: 60_000,
  });

export const customerBookingsQuery = (id: string, customerId: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "bookings", { customerId }],
    queryFn: () =>
      api.get<Paginated<BookingDto>>(`/api/v1/restaurants/${id}/bookings`, {
        customerId,
        order: "desc",
        pageSize: 100,
      }),
  });

export interface BookingsSearchParams {
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
}

export const bookingsSearchQuery = (id: string, params: BookingsSearchParams) =>
  queryOptions({
    queryKey: ["restaurant", id, "bookings", { search: params }],
    queryFn: () =>
      api.get<Paginated<BookingDto>>(`/api/v1/restaurants/${id}/bookings`, {
        search: params.search || undefined,
        status: params.status || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
        order: params.from && !params.to ? "asc" : "desc",
        page: params.page,
        pageSize: 50,
      }),
    placeholderData: (prev) => prev,
  });

/** Slots as staff see them: only real capacity, none of the online-only rules. */
export const staffAvailabilityQuery = (id: string, date: string, partySize: number) =>
  queryOptions({
    queryKey: ["availability", "staff", id, date, partySize],
    queryFn: () =>
      api.get<AvailabilityResponse>(`/api/v1/restaurants/${id}/availability`, {
        date,
        partySize,
      }),
    staleTime: 5_000,
  });

/** Every booking between two dates (inclusive), e.g. to see what a closure would hit. */
export const bookingsInRangeQuery = (id: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "bookings", { range: [from, to] }],
    queryFn: () =>
      api.get<Paginated<BookingDto>>(`/api/v1/restaurants/${id}/bookings`, {
        from,
        to,
        order: "asc",
        pageSize: 200,
      }),
    staleTime: 10_000,
  });

export const availabilityQuery = (slug: string, date: string, partySize: number) =>
  queryOptions({
    queryKey: ["availability", slug, date, partySize],
    queryFn: () =>
      api.get<AvailabilityResponse>(`/api/public/v1/restaurants/${slug}/availability`, {
        date,
        partySize,
      }),
    staleTime: 5_000,
  });

export const providersQuery = () =>
  queryOptions({
    queryKey: ["notification-providers"],
    queryFn: () => api.get<ProviderDescriptorDto[]>("/api/v1/notification-providers"),
    staleTime: 300_000,
  });

export const providerConfigQuery = (id: string, channel: NotificationChannel) =>
  queryOptions({
    queryKey: ["restaurant", id, "provider", channel],
    queryFn: () =>
      api.get<ProviderConfigDto>(`/api/v1/restaurants/${id}/notification-providers/${channel}`),
  });

export const notificationSettingsQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "notification-settings"],
    queryFn: () =>
      api.get<NotificationSettingDto[]>(`/api/v1/restaurants/${id}/notification-settings`),
  });

export const bookingNotificationsQuery = (id: string, bookingId: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "bookings", bookingId, "notifications"],
    queryFn: () =>
      api.get<NotificationLogDto[]>(
        `/api/v1/restaurants/${id}/bookings/${bookingId}/notifications`,
      ),
    // sends happen asynchronously; keep polling while anything is still queued
    refetchInterval: (query) => {
      const rows = query.state.data;
      return !rows || rows.length === 0 || rows.some((n) => n.status === "queued") ? 3_000 : false;
    },
  });

export const teamQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "team"],
    queryFn: () => api.get<TeamDto>(`/api/v1/restaurants/${id}/team`),
  });

export const assistantsQuery = () =>
  queryOptions({
    queryKey: ["assistants"],
    queryFn: () => api.get<AssistantsStatusDto>("/api/v1/assistants"),
  });

export const apiKeysQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "api-keys"],
    queryFn: () => api.get<ApiKeyDto[]>(`/api/v1/restaurants/${id}/api-keys`),
  });

export const invitationQuery = (invitationId: string) =>
  queryOptions({
    queryKey: ["invitation", invitationId],
    queryFn: () => api.get<PublicInvitationDto>(`/api/v1/invitations/${invitationId}`),
    retry: false,
  });

export interface AuthConfig {
  signupMode: "open" | "invite_only" | "first_user";
  signupOpen: boolean;
}

export const authConfigQuery = () =>
  queryOptions({
    queryKey: ["auth-config"],
    queryFn: () => api.get<AuthConfig>("/api/v1/auth-config"),
    staleTime: 60_000,
  });

export const templatesQuery = (id: string, locale: "it" | "en") =>
  queryOptions({
    queryKey: ["restaurant", id, "notification-templates", locale],
    queryFn: () =>
      api.get<NotificationTemplateDto[]>(`/api/v1/restaurants/${id}/notification-templates`, {
        locale,
      }),
  });

export const analyticsQuery = (id: string, from: string, to: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "analytics", from, to],
    queryFn: () => api.get<AnalyticsDto>(`/api/v1/restaurants/${id}/analytics`, { from, to }),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });

export const waitlistQuery = (id: string, date: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "waitlist", date],
    queryFn: () =>
      api.get<Paginated<WaitlistEntryDto>>(`/api/v1/restaurants/${id}/waitlist`, {
        date,
        pageSize: 200,
      }),
    refetchInterval: 30_000,
  });

export const tablesQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "tables"],
    queryFn: () => api.get<TableDto[]>(`/api/v1/restaurants/${id}/tables`),
    staleTime: 60_000,
  });

export const paymentConfigQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "payments", "config"],
    queryFn: () => api.get<PaymentConfigDto>(`/api/v1/restaurants/${id}/payments/config`),
  });

export const feedbackSummaryQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "feedback", "summary"],
    queryFn: () => api.get<FeedbackSummaryDto>(`/api/v1/restaurants/${id}/feedback/summary`),
  });

export const feedbackQuery = (id: string, params: { rating?: number; page?: number }) =>
  queryOptions({
    queryKey: ["restaurant", id, "feedback", params],
    queryFn: () =>
      api.get<Paginated<FeedbackDto>>(`/api/v1/restaurants/${id}/feedback`, {
        rating: params.rating,
        page: params.page,
        pageSize: 50,
      }),
    placeholderData: (prev) => prev,
  });
