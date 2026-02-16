import type { PublicBookingDto } from "@sitli/shared";
import { formatInstant, formatMoney } from "../dates.js";
import { locale, t } from "../i18n.js";
import { reset } from "../state.js";

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
      <a class="btn" href={p.checkoutUrl} target="_top" style={{ textDecoration: "none" }}>
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
      <div class="icon">{paying ? "💳" : pending ? "⏳" : "✓"}</div>
      <h1>{paying ? t("payment.title") : pending ? t("pendingTitle") : t("confirmedTitle")}</h1>
      <p class="sub">
        {paying ? t("payment.intro") : pending ? t("pendingText") : t("confirmedText")}
      </p>
      <PaymentNotice booking={booking} />
      <div class="summary" style={{ textAlign: "left" }}>
        <div>
          <span>{t("date")}</span>
          <strong>
            {formatInstant(booking.startsAt, booking.restaurant.timezone, locale.value)}
          </strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>{booking.partySize}</strong>
        </div>
        <div>
          <span>{t("code")}</span>
          <strong class="code">{booking.confirmationCode}</strong>
        </div>
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
          style={{ textDecoration: "none", textAlign: "center" }}
        >
          {t("manage")}
        </a>
      </div>
    </div>
  );
}
