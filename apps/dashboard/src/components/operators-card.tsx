import type { OperatorDto } from "@openpax/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash, UserPen } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, IconButton, Input, useConfirm, useToast } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { operatorsQuery } from "@/lib/queries";

const PIN = /^\d{6}$/;
const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

/**
 * The floor staff who share the dashboard login. Each has a 6-digit code to
 * take, change or cancel bookings; codes are stored hashed and never shown.
 */
export function OperatorsCard({
  restaurantId,
  canManage,
}: {
  restaurantId: string;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useQuery(operatorsQuery(restaurantId));
  const operators = list.data ?? [];
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  // the operator whose code is being changed, and the new code
  const [changing, setChanging] = useState<OperatorDto | null>(null);
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/restaurants/${restaurantId}/operators`;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: operatorsQuery(restaurantId).queryKey });
  const onError = (e: unknown) =>
    setError(
      e instanceof ApiClientError && e.code === "operator_exists"
        ? t("operators.duplicate")
        : e instanceof ApiClientError
          ? e.message
          : t("app.error"),
    );

  const add = useMutation({
    mutationFn: (body: { name: string; pin: string }) => api.post<OperatorDto>(base, body),
    onSuccess: async () => {
      await refresh();
      setName("");
      setPin("");
      setError(null);
    },
    onError,
  });
  const changePin = useMutation({
    mutationFn: (v: { id: string; pin: string }) => api.patch(`${base}/${v.id}`, { pin: v.pin }),
    onSuccess: () => {
      setChanging(null);
      setNewPin("");
      setError(null);
      toast.success(t("operators.pinChanged"));
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: async () => {
      await refresh();
      setError(null);
    },
    onError,
  });

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !PIN.test(pin)) return;
    if (operators.some((o) => o.name.toLowerCase() === trimmed.toLowerCase())) {
      setError(t("operators.duplicate"));
      return;
    }
    add.mutate({ name: trimmed, pin });
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
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {operators.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-[15px] font-semibold">{o.name}</span>
                {canManage && changing?.id === o.id ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (PIN.test(newPin)) changePin.mutate({ id: o.id, pin: newPin });
                    }}
                  >
                    <Input
                      value={newPin}
                      onChange={(e) => setNewPin(onlyDigits(e.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t("operators.newPin")}
                      aria-label={t("operators.newPin")}
                      className="w-32 tabular-nums"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      loading={changePin.isPending}
                      disabled={!PIN.test(newPin)}
                    >
                      {t("app.save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setChanging(null)}>
                      {t("app.cancel")}
                    </Button>
                  </form>
                ) : canManage ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<KeyRound />}
                      onClick={() => {
                        setChanging(o);
                        setNewPin("");
                      }}
                    >
                      {t("operators.changePin")}
                    </Button>
                    <IconButton
                      size="sm"
                      label={t("operators.remove", { name: o.name })}
                      className="text-stone-400 hover:text-red-600"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: t("operators.confirmRemove", { name: o.name }),
                            confirmLabel: t("app.delete"),
                            tone: "danger",
                          })
                        )
                          remove.mutate(o.id);
                      }}
                    >
                      <Trash />
                    </IconButton>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form onSubmit={submit} className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("operators.placeholder")}
              aria-label={t("operators.placeholder")}
              maxLength={60}
              className="min-w-40 flex-1"
            />
            <Input
              value={pin}
              onChange={(e) => setPin(onlyDigits(e.target.value))}
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("operators.pin")}
              aria-label={t("operators.pin")}
              className="w-36 tabular-nums"
            />
            <Button
              type="submit"
              variant="secondary"
              loading={add.isPending}
              disabled={!name.trim() || !PIN.test(pin)}
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
