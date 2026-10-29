import type { OperatorDto } from "@openpax/shared";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Delete } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Dialog, Spinner } from "@/components/ui";
import { ApiClientError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface VerifiedOperator {
  id: string;
  name: string;
  pin: string;
}

const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Touch-screen "who are you?": big name buttons, then a 6-digit keypad. The
 * code is checked as soon as the sixth digit is typed.
 */
export function OperatorGate({
  restaurantId,
  operators,
  open,
  title,
  onCancel,
  onVerified,
}: {
  restaurantId: string;
  operators: OperatorDto[];
  open: boolean;
  title: string;
  onCancel: () => void;
  onVerified: (op: VerifiedOperator) => void;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<OperatorDto | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setChosen(null);
    setPin("");
    setError(null);
  }, [open]);

  const verify = useMutation({
    mutationFn: (v: { op: OperatorDto; pin: string }) =>
      api.post(`/api/v1/restaurants/${restaurantId}/operators/${v.op.id}/verify`, { pin: v.pin }),
    onSuccess: (_r, v) => onVerified({ id: v.op.id, name: v.op.name, pin: v.pin }),
    onError: (e) => {
      setPin("");
      setError(
        e instanceof ApiClientError && e.code === "operator_locked"
          ? t("operators.locked")
          : e instanceof ApiClientError && e.code === "wrong_pin"
            ? t("operators.wrongPin")
            : t("app.error"),
      );
    },
  });

  const press = (digit: string) => {
    if (!chosen || verify.isPending || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setError(null);
    setPin(next);
    if (next.length === PIN_LENGTH) verify.mutate({ op: chosen, pin: next });
  };

  const key =
    "flex h-16 items-center justify-center rounded-2xl border border-stone-300 bg-white text-2xl font-semibold tabular-nums active:bg-brand-50 disabled:opacity-40";

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={chosen ? t("operators.typeCode", { name: chosen.name }) : title}
      size="md"
      footer={
        <Button variant="secondary" size="lg" onClick={onCancel}>
          {t("app.cancel")}
        </Button>
      }
    >
      {!chosen ? (
        <div className="grid grid-cols-2 gap-3">
          {operators.map((op) => (
            <button
              key={op.id}
              type="button"
              onClick={() => setChosen(op)}
              className="flex h-20 items-center justify-center rounded-2xl border-2 border-stone-200 bg-white px-3 text-xl font-semibold active:border-brand-600 active:bg-brand-50"
            >
              {op.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className="flex justify-center gap-3"
            role="img"
            aria-label={`${t("operators.code")}: ${pin.length}/${PIN_LENGTH}`}
          >
            {Array.from({ length: PIN_LENGTH }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-5 rounded-full border-2 border-stone-400",
                  i < pin.length && "border-brand-600 bg-brand-600",
                )}
              />
            ))}
          </div>
          {verify.isPending ? (
            <div className="flex justify-center">
              <Spinner />
            </div>
          ) : null}
          {error ? <Alert>{error}</Alert> : null}
          <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
            {KEYS.map((d) => (
              <button
                key={d}
                type="button"
                className={key}
                onClick={() => press(d)}
                disabled={verify.isPending}
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              className={key}
              aria-label={t("operators.back")}
              onClick={() => {
                setChosen(null);
                setPin("");
                setError(null);
              }}
            >
              <ArrowLeft className="size-7" />
            </button>
            <button
              type="button"
              className={key}
              onClick={() => press("0")}
              disabled={verify.isPending}
            >
              0
            </button>
            <button
              type="button"
              className={key}
              aria-label={t("operators.erase")}
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={verify.isPending}
            >
              <Delete className="size-7" />
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
