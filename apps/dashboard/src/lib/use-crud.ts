import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * List + dialog CRUD wiring for the small settings collections
 * (`/api/v1/restaurants/:id/<segment>`): tracks what is being edited, saves
 * with POST or PUT, deletes, and refreshes the given query keys plus the
 * availability cache, which every one of these collections affects.
 */
export function useCrud<TDto extends { id: string }, TInput>(
  restaurantId: string,
  segment: string,
  keys: string | string[],
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<TDto | "new" | null>(null);
  const invalidate = () =>
    Promise.all([
      ...(Array.isArray(keys) ? keys : [keys]).map((key) =>
        queryClient.invalidateQueries({ queryKey: ["restaurant", restaurantId, key] }),
      ),
      queryClient.invalidateQueries({ queryKey: ["availability"] }),
    ]);
  const save = useMutation({
    mutationFn: (v: TInput) =>
      editing === "new" || !editing
        ? api.post(`/api/v1/restaurants/${restaurantId}/${segment}`, v)
        : api.put(`/api/v1/restaurants/${restaurantId}/${segment}/${editing.id}`, v),
    onSuccess: async () => {
      await invalidate();
      setEditing(null);
      toast.success(t("app.saved"));
    },
    onError: () => toast.error(t("app.error")),
  });
  /** Update one item in place without opening a dialog (e.g. a toggle in a row). */
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TInput }) =>
      api.put(`/api/v1/restaurants/${restaurantId}/${segment}/${id}`, body),
    onSuccess: async () => {
      await invalidate();
      toast.success(t("app.saved"));
    },
    onError: () => toast.error(t("app.error")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/restaurants/${restaurantId}/${segment}/${id}`),
    onSuccess: invalidate,
    onError: () => toast.error(t("app.error")),
  });
  return { editing, setEditing, save, patch, remove, invalidate };
}
