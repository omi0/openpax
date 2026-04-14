import type { PublicBookingDto } from "@openpax/shared";
import { formatInstant, formatMoney } from "../dates.js";
import { locale, t } from "../i18n.js";
import { reset } from "../state.js";
import { CodeBox, DoneIcon } from "./chrome.js";

export function PaymentNotice({ booking }: { booking: PublicBookingDto }) {
  const p = booking.payment;
  if (p?.status !== "pending" || !p.checkoutUrl) return null;
  const amount = formatMoney(p.amountCents, p.currency, locale.value);
  return (
    <div class="pay">
      <p>
        {p.kind === "deposit"
          ? t("payment.depositText", { amount })
          : t("payment.cardText", { amount })}
      </p>
      {p.expiresAt ? (
        <p class="sub">
          {t("payment.until", {
            time: formatInstant(p.expiresAt, booking.restaurant.timezone, locale.value),
          })}
        </p>
      ) : null}
      <a class="btn" href={p.checkoutUrl} target="_top">
        {p.kind === "deposit" ? t("payment.payDeposit") : t("payment.saveCard")}
      </a>
    </div>
  );
}

export function Confirmation({ booking, hosted }: { booking: PublicBookingDto; hosted: boolean }) {
  const paying = booking.payment?.status === "pending";
  const pending = booking.status === "pending" && !paying;
  return (
    <div class="done">
      <DoneIcon kind={paying ? "card" : pending ? "wait" : "check"} />
      <h1>{paying ? t("payment.title") : pending ? t("pendingTitle") : t("confirmedTitle")}</h1>
      <p class="sub">
        {paying ? t("payment.intro") : pending ? t("pendingText") : t("confirmedText")}
      </p>
      <PaymentNotice booking={booking} />
      <CodeBox code={booking.confirmationCode} />
      <div class="summary">
        <div>
          <span>{t("restaurant")}</span>
          <strong>{booking.restaurant.name}</strong>
        </div>
        <div>
          <span>{t("date")}</span>
          <strong>
            {formatInstant(booking.startsAt, booking.restaurant.timezone, locale.value)}
          </strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>
            {booking.partySize === 1 ? t("guestsOne") : t("guestsMany", { n: booking.partySize })}
          </strong>
        </div>
        {booking.restaurant.address ? (
          <div>
            <span>{t("address")}</span>
            <strong>{booking.restaurant.address}</strong>
          </div>
        ) : null}
      </div>
      <div class="actions">
        <button type="button" class="btn secondary" onClick={reset}>
          {t("newBooking")}
        </button>
        <a
          class="btn"
          href={booking.manageUrl}
          target={hosted ? "_self" : "_blank"}
          rel="noreferrer"
        >
          {t("manage")}
        </a>
      </div>
    </div>
  );
}
