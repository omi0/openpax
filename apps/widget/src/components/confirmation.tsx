import type { PublicBookingDto } from "@sitli/shared";
import { formatInstant } from "../dates.js";
import { locale, t } from "../i18n.js";
import { reset } from "../state.js";

export function Confirmation({ booking, hosted }: { booking: PublicBookingDto; hosted: boolean }) {
  const pending = booking.status === "pending";
  return (
    <div class="done">
      <div class="icon">{pending ? "⏳" : "✓"}</div>
      <h1>{pending ? t("pendingTitle") : t("confirmedTitle")}</h1>
      <p class="sub">{pending ? t("pendingText") : t("confirmedText")}</p>
      <div class="summary" style={{ textAlign: "left" }}>
        <div>
          <span>{t("date")}</span>
          <strong>{formatInstant(booking.startsAt, booking.restaurant.timezone, locale.value)}</strong>
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
        <a class="btn" href={booking.manageUrl} target={hosted ? "_self" : "_blank"} rel="noreferrer" style={{ textDecoration: "none", textAlign: "center" }}>
          {t("manage")}
        </a>
      </div>
    </div>
  );
}
