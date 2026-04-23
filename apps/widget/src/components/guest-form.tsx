import { ApiRequestError, api } from "../api.js";
import { formatInstant } from "../dates.js";
import { locale, t } from "../i18n.js";
import {
  config,
  guest,
  partySize,
  result,
  selectedServiceName,
  selectedSlot,
  slug,
  step,
  submitError,
  submitting,
} from "../state.js";
import { ErrorBox } from "./chrome.js";

function idempotencyKey() {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** A sentence with {terms} and {privacy} placeholders, rendered as links when the URLs are set. */
function Legal({
  text,
  terms,
  privacy,
  privacyLabel,
}: {
  text: string;
  terms: string | null;
  privacy: string | null;
  privacyLabel: string;
}) {
  const nodes = [];
  let offset = 0;
  for (const part of text.split(/(\{terms\}|\{privacy\})/)) {
    const key = `${offset}`;
    offset += part.length;
    if (part === "{terms}")
      nodes.push(
        terms ? (
          <a key={key} href={terms} target="_blank" rel="noreferrer">
            {t("termsLink")}
          </a>
        ) : (
          t("termsLink")
        ),
      );
    else if (part === "{privacy}")
      nodes.push(
        privacy ? (
          <a key={key} href={privacy} target="_blank" rel="noreferrer">
            {privacyLabel}
          </a>
        ) : (
          privacyLabel
        ),
      );
    else nodes.push(part);
  }
  return <>{nodes}</>;
}

export function GuestForm({ onDone }: { onDone: () => void }) {
  const cfg = config.value;
  const slot = selectedSlot.value;
  if (!cfg || !slot) return null;
  const g = guest.value;
  const update = (patch: Partial<typeof g>) => {
    guest.value = { ...g, ...patch };
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    submitting.value = true;
    submitError.value = null;
    try {
      result.value = await api.book(slug.value, {
        serviceId: slot.serviceId,
        startsAt: slot.startsAt,
        partySize: partySize.value,
        guest: {
          name: g.name,
          email: g.email || undefined,
          phone: g.phone || undefined,
          locale: locale.value,
        },
        notes: g.notes || undefined,
        marketingConsent: g.marketing,
        privacyAccepted: g.privacy,
        idempotencyKey: idempotencyKey(),
      });
      step.value = "done";
      onDone();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const key = `errors.${error.code}`;
        submitError.value = t(key) === key ? error.message : t(key);
      } else submitError.value = t("errors.generic");
    } finally {
      submitting.value = false;
    }
  };

  const terms = cfg.widget.termsUrl;
  const privacy = cfg.widget.privacyUrl;
  const back = () => {
    step.value = "when";
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div class="summary">
        <div class="summary-head">
          <strong>{t("yourTable")}</strong>
          <button type="button" class="change" onClick={back}>
            {t("change")}
          </button>
        </div>
        <div>
          <span>{t("date")}</span>
          <strong>{formatInstant(slot.startsAt, cfg.restaurant.timezone, locale.value)}</strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>
            {partySize.value === 1 ? t("guestsOne") : t("guestsMany", { n: partySize.value })}
          </strong>
        </div>
        {selectedServiceName.value ? (
          <div>
            <span>{t("service")}</span>
            <strong>{selectedServiceName.value}</strong>
          </div>
        ) : null}
      </div>

      <h2>{t("yourDetails")}</h2>
      <div class="field">
        <label for="openpax-name">{t("name")}</label>
        <input
          id="openpax-name"
          type="text"
          required
          autocomplete="name"
          value={g.name}
          onInput={(e) => update({ name: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label for="openpax-email">
          {t("email")}
          {!cfg.widget.requireEmail ? ` (${t("optional")})` : ""}
        </label>
        <input
          id="openpax-email"
          type="email"
          required={cfg.widget.requireEmail}
          autocomplete="email"
          inputMode="email"
          value={g.email}
          onInput={(e) => update({ email: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label for="openpax-phone">
          {t("phone")}
          {!cfg.widget.requirePhone ? ` (${t("optional")})` : ""}
        </label>
        <input
          id="openpax-phone"
          type="tel"
          required={cfg.widget.requirePhone}
          autocomplete="tel"
          inputMode="tel"
          value={g.phone}
          onInput={(e) => update({ phone: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label for="openpax-notes">{t("notes")}</label>
        <textarea
          id="openpax-notes"
          maxLength={1000}
          value={g.notes}
          onInput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value })}
        />
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={g.marketing}
          onChange={(e) => update({ marketing: (e.target as HTMLInputElement).checked })}
        />
        <span>{t("marketing")}</span>
      </label>
      {cfg.widget.requirePrivacyConsent ? (
        <label class="check">
          <input
            type="checkbox"
            required
            checked={g.privacy}
            onChange={(e) => update({ privacy: (e.target as HTMLInputElement).checked })}
          />
          <span>
            <Legal
              text={terms ? t("consentWithTerms") : t("consent")}
              terms={terms}
              privacy={privacy}
              privacyLabel={t("consentPrivacyLink")}
            />
          </span>
        </label>
      ) : terms || privacy ? (
        <p class="fine">
          <Legal
            text={t("terms")}
            terms={terms}
            privacy={privacy}
            privacyLabel={t("privacyLink")}
          />
        </p>
      ) : null}

      {submitError.value ? <ErrorBox>{submitError.value}</ErrorBox> : null}
      <div class="actions">
        <button type="button" class="btn secondary" onClick={back}>
          {t("back")}
        </button>
        <button type="submit" class="btn" disabled={submitting.value}>
          {submitting.value ? t("booking") : t("book")}
        </button>
      </div>
    </form>
  );
}
