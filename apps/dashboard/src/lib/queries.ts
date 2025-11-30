import type {
  AvailabilityResponse,
  BookingDto,
  BookingPolicyDto,
  NotificationChannel,
  NotificationLogDto,
  NotificationSettingDto,
  ProviderConfigDto,
  ProviderDescriptorDto,
  RestaurantDto,
  RestaurantSummaryDto,
  ServiceDto,
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

export const policyQuery = (id: string) =>
  queryOptions({
    queryKey: ["restaurant", id, "policy"],
    queryFn: () => api.get<BookingPolicyDto>(`/api/v1/restaurants/${id}/policy`),
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
  });
