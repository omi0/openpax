import { useSignal } from "@preact/signals";
import type { PublicBookingDto, PublicWaitlistEntryDto } from "@sitli/shared";
import { useEffect } from "preact/hooks";
import { ApiRequestError, api } from "../api.js";
import { formatDateLong, formatInstant } from "../dates.js";
import { locale, setLocale, t } from "../i18n.js";

/** The guest's waitlist link: shows the queue status, the open offer, and lets them accept or leave. */
export function WaitlistPage({ token }: { token: string }) {
  const entry = useSignal<PublicWaitlistEntryDto | null>(null);
  const booking = useSignal<PublicBookingDto | null>(null);
  const error = useSignal<string | null>(null);
  const busy = useSignal(false);

  useEffect(() => {
    api
      .waitlist(token)
      .then((e) => {
        entry.value = e;
      })
      .catch(() => {
        error.value = t("errors.generic");
      });
  }, [token, entry, error]);

  const fail = (err: unknown) => {
    if (err instanceof ApiRequestError) {
      const key = `waitlist.errors.${err.code}`;
      error.value = t(key) !== key ? t(key) : err.message;
    } else error.value = t("errors.generic");
  };
  const accept = async () => {
    busy.value = true;
    error.value = null;
    try {
      booking.value = await api.acceptWaitlist(token);
      entry.value = await api.waitlist(token);
    } catch (err) {
      fail(err);
    } finally {
      busy.value = false;
    }
  };
  const leave = async () => {
    if (!window.confirm(t("waitlist.leaveConfirm"))) return;
    busy.value = true;
    error.value = null;
    try {
      entry.value = await api.leaveWaitlist(token);
    } catch (err) {
      fail(err);
    } finally {
      busy.value = false;
    }
  };

  const e = entry.value;
  if (!e) return <p class="sub">{error.value ?? "…"}</p>;
  const tz = e.restaurant.timezone;
  return (
    <div>
      <div class="lang">
        {(["it", "en"] as const).map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={locale.value === l}
            onClick={() => setLocale(l)}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <h1>{t("waitlist.pageTitle")}</h1>
      <p class="sub">{e.restaurant.name}</p>
      <div class="summary">
        <div>
          <span>{t("date")}</span>
          <strong>{formatDateLong(e.serviceDate, locale.value)}</strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>{e.partySize}</strong>
        </div>
        {e.preferredTime ? (
          <div>
            <span>{t("time")}</span>
            <strong>{e.preferredTime}</strong>
          </div>
        ) : null}
      </div>
      {error.value ? <div class="error">{error.value}</div> : null}

      {e.status === "booked" ? (
        <div class="done">
          <div class="icon">✓</div>
          <p>{t("waitlist.booked")}</p>
          {booking.value ? (
            <p>
              <strong>
                {formatInstant(booking.value.startsAt, tz, locale.value)} ·{" "}
                <span class="code">{booking.value.confirmationCode}</span>
              </strong>
            </p>
          ) : null}
          {e.bookingManageUrl ? (
            <div class="actions">
              <a class="btn" href={e.bookingManageUrl} style={{ textDecoration: "none" }}>
                {t("waitlist.viewBooking")}
              </a>
            </div>
          ) : null}
        </div>
      ) : e.status === "offered" && e.offer && e.canAccept ? (
        <div>
          <h2>{t("waitlist.offerTitle")}</h2>
          <div class="summary">
            <div>
              <span>{t("date")}</span>
              <strong>{formatInstant(e.offer.startsAt, tz, locale.value)}</strong>
            </div>
            {e.offer.serviceName ? (
              <div>
                <span />
                <strong>{e.offer.serviceName}</strong>
              </div>
            ) : null}
          </div>
          <p class="sub">
            {t("waitlist.offerText", { until: formatInstant(e.offer.expiresAt, tz, locale.value) })}
          </p>
          <div class="actions">
            <button
              type="button"
              class="btn secondary"
              disabled={busy.value}
              onClick={() => void leave()}
            >
              {t("waitlist.decline")}
            </button>
            <button type="button" class="btn" disabled={busy.value} onClick={() => void accept()}>
              {t("waitlist.accept")}
            </button>
          </div>
        </div>
      ) : e.status === "waiting" || e.status === "offered" ? (
        <div>
          <p>{t("waitlist.waiting")}</p>
          <div class="actions">
            <button
              type="button"
              class="btn danger"
              disabled={busy.value}
              onClick={() => void leave()}
            >
              {t("waitlist.leave")}
            </button>
          </div>
        </div>
      ) : e.status === "expired" ? (
        <p>{t("waitlist.expired")}</p>
      ) : (
        <p>{t("waitlist.cancelled")}</p>
      )}
    </div>
  );
}
