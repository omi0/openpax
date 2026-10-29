import type { BookingPolicyDto } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPen, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Button, Card, Input } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { policyQuery } from "@/lib/queries";

/** Names staff pick from when they take a booking; each change is saved straight away. */
export function OperatorsCard({
  restaurantId,
  canManage,
}: {
  restaurantId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const policy = useQuery(policyQuery(restaurantId));
  const operators = policy.data?.operators ?? [];
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: string[]) =>
      api.put<BookingPolicyDto>(`/api/v1/restaurants/${restaurantId}/policy`, {
        operators: next,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(policyQuery(restaurantId).queryKey, updated);
      setName("");
      setError(null);
    },
    onError: (e) => setError(e instanceof ApiClientError ? e.message : t("app.error")),
  });

  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (operators.some((o) => o.toLowerCase() === trimmed.toLowerCase())) {
      setError(t("operators.duplicate"));
      return;
    }
    setError(null);
    save.mutate([...operators, trimmed]);
  };

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <UserPen className="size-5 text-brand-700" /> {t("operators.title")}
        </span>
      }
      description={t("operators.hint")}
    >
      <div className="space-y-3">
        {operators.length === 0 ? (
          <p className="text-sm text-stone-500">{t("operators.empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {operators.map((o) => (
              <li key={o}>
                <Badge>
                  {o}
                  {canManage ? (
                    <button
                      type="button"
                      aria-label={t("operators.remove", { name: o })}
                      className="ml-1 rounded text-stone-400 hover:text-red-700"
                      disabled={save.isPending}
                      onClick={() => save.mutate(operators.filter((x) => x !== o))}
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("operators.placeholder")}
              maxLength={60}
              aria-label={t("operators.placeholder")}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={save.isPending}
              disabled={!name.trim()}
            >
              {t("operators.add")}
            </Button>
          </form>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
      </div>
    </Card>
  );
}
