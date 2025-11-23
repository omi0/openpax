import { useSignal } from "@preact/signals";
import type { PublicBookingDto } from "@sitli/shared";
import { useEffect } from "preact/hooks";
import { api, ApiRequestError } from "../api.js";
import { formatInstant } from "../dates.js";
import { locale, setLocale, t } from "../i18n.js";

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
      error.value = e instanceof ApiRequestError && e.code === "cancellation_cutoff" ? t("cannotCancel") : t("errors.generic");
    } finally {
      busy.value = false;
    }
  };

  const b = booking.value;
  if (!b) return <p class="sub">{error.value ?? "…"}</p>;
  return (
    <div>
      <div class="lang">
        {(["it", "en"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={locale.value === l} onClick={() => setLocale(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <h1>{t("manageTitle")}</h1>
      <p class="sub">{b.restaurant.name}</p>
      <div class="summary">
        <div>
          <span>{t("date")}</span>
          <strong>{formatInstant(b.startsAt, b.restaurant.timezone, locale.value)}</strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>{b.partySize}</strong>
        </div>
        <div>
          <span>{t("code")}</span>
          <strong class="code">{b.confirmationCode}</strong>
        </div>
        <div>
          <span />
          <span class="status">{t(`status.${b.status}`)}</span>
        </div>
      </div>
      {b.restaurant.address ? <p class="sub">{b.restaurant.address}</p> : null}
      {error.value ? <div class="error">{error.value}</div> : null}
      {b.status === "cancelled" ? (
        <p>{t("cancelled")}</p>
      ) : b.canCancel ? (
        <div class="actions">
          <button type="button" class="btn danger" disabled={busy.value} onClick={() => void cancel()}>
            {t("cancel")}
          </button>
        </div>
      ) : (
        <p class="sub">{t("cannotCancel")}</p>
      )}
    </div>
  );
}
