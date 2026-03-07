import { useSignal } from "@preact/signals";
import type { PublicBookingDto } from "@sitli/shared";
import { useEffect } from "preact/hooks";
import { ApiRequestError, api } from "../api.js";
import { formatInstant, formatMoney } from "../dates.js";
import { locale, t } from "../i18n.js";
import { ErrorBox, Header, Loading } from "./chrome.js";
import { PaymentNotice } from "./confirmation.js";

export function Manage({ token }: { token: string }) {
  const booking = useSignal<PublicBookingDto | null>(null);
  const error = useSignal<string | null>(null);
  const busy = useSignal(false);

  useEffect(() => {
    api
      .lookup(token)
      .then((b) => {
        booking.value = b;
      })
      .catch(() => {
        error.value = t("errors.generic");
      });
  }, [token, booking, error]);

  const cancel = async () => {
    if (!window.confirm(t("cancelConfirm"))) return;
    busy.value = true;
    try {
      booking.value = await api.cancel(token);
    } catch (e) {
      error.value =
        e instanceof ApiRequestError && e.code === "cancellation_cutoff"
          ? t("cannotCancel")
          : t("errors.generic");
    } finally {
      busy.value = false;
    }
  };

  const b = booking.value;
  if (!b) return error.value ? <ErrorBox>{error.value}</ErrorBox> : <Loading />;
  return (
    <div>
      <Header title={t("manageTitle")} subtitle={b.restaurant.name} />
      <div class="summary">
        <div>
          <span>{t("status.label")}</span>
          <span class={`status ${b.status}`}>{t(`status.${b.status}`)}</span>
        </div>
        <div>
          <span>{t("date")}</span>
          <strong>{formatInstant(b.startsAt, b.restaurant.timezone, locale.value)}</strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>
            {b.partySize === 1 ? t("guestsOne") : t("guestsMany", { n: b.partySize })}
          </strong>
        </div>
        <div>
          <span>{t("code")}</span>
          <strong class="code">{b.confirmationCode}</strong>
        </div>
        {b.restaurant.address ? (
          <div>
            <span>{t("address")}</span>
            <strong>{b.restaurant.address}</strong>
          </div>
        ) : null}
      </div>
      {b.payment && b.payment.status !== "pending" ? (
        <p class="note">
          {t(`payment.status.${b.payment.status}`, {
            amount: formatMoney(b.payment.amountCents, b.payment.currency, locale.value),
          })}
        </p>
      ) : null}
      <PaymentNotice booking={b} />
      {error.value ? <ErrorBox>{error.value}</ErrorBox> : null}
      {b.status === "cancelled" ? (
        <p class="note">{t("cancelled")}</p>
      ) : b.canCancel ? (
        <div class="actions">
          <button
            type="button"
            class="btn danger"
            disabled={busy.value}
            onClick={() => void cancel()}
          >
            {t("cancel")}
          </button>
        </div>
      ) : (
        <p class="note">{t("cannotCancel")}</p>
      )}
    </div>
  );
}
