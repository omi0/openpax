import { useSignal } from "@preact/signals";
import type { PublicWaitlistEntryDto } from "@sitli/shared";
import { ApiRequestError, api } from "../api.js";
import { formatDateLong } from "../dates.js";
import { locale, t } from "../i18n.js";
import {
  availability,
  config,
  date,
  guest,
  partySize,
  reset,
  slug,
  step,
  waitlistResult,
} from "../state.js";
import { DoneIcon, ErrorBox } from "./chrome.js";

/** Contact form shown when the chosen date has no bookable time. */
export function WaitlistForm({ onDone }: { onDone: () => void }) {
  const cfg = config.value;
  const busy = useSignal(false);
  const error = useSignal<string | null>(null);
  const preferredTime = useSignal("");
  if (!cfg) return null;
  const g = guest.value;
  const update = (patch: Partial<typeof g>) => {
    guest.value = { ...g, ...patch };
  };
  // the day's slot times, so the guest picks a realistic one
  const times = [...new Set((availability.value?.slots ?? []).map((s) => s.startLocal))];

  const submit = async (e: Event) => {
    e.preventDefault();
    busy.value = true;
    error.value = null;
    try {
      waitlistResult.value = await api.joinWaitlist(slug.value, {
        serviceDate: date.value,
        partySize: partySize.value,
        preferredTime: preferredTime.value || null,
        guest: { name: g.name, email: g.email, phone: g.phone || undefined, locale: locale.value },
        notes: g.notes || undefined,
        marketingConsent: g.marketing,
      });
      step.value = "waitlist_done";
      onDone();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const key = `waitlist.errors.${err.code}`;
        const generic = `errors.${err.code}`;
        error.value = t(key) !== key ? t(key) : t(generic) !== generic ? t(generic) : err.message;
      } else error.value = t("errors.generic");
    } finally {
      busy.value = false;
    }
  };
  const back = () => {
    step.value = "when";
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <h2>{t("waitlist.title")}</h2>
      <p class="sub">{t("waitlist.intro")}</p>
      <div class="summary">
        <div class="summary-head">
          <strong>{t("yourTable")}</strong>
          <button type="button" class="change" onClick={back}>
            {t("change")}
          </button>
        </div>
        <div>
          <span>{t("date")}</span>
          <strong>{formatDateLong(date.value, locale.value)}</strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>
            {partySize.value === 1 ? t("guestsOne") : t("guestsMany", { n: partySize.value })}
          </strong>
        </div>
      </div>
      <div class="field">
        <label for="sitli-wl-time">{t("waitlist.preferredTime")}</label>
        <select
          id="sitli-wl-time"
          value={preferredTime.value}
          onChange={(e) => {
            preferredTime.value = (e.target as HTMLSelectElement).value;
          }}
        >
          <option value="">{t("waitlist.anyTime")}</option>
          {times.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </div>
      <div class="field">
        <label for="sitli-wl-name">{t("name")}</label>
        <input
          id="sitli-wl-name"
          type="text"
          required
          autocomplete="name"
          value={g.name}
          onInput={(e) => update({ name: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label for="sitli-wl-email">{t("email")}</label>
        <input
          id="sitli-wl-email"
          type="email"
          required
          autocomplete="email"
          inputMode="email"
          value={g.email}
          onInput={(e) => update({ email: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label for="sitli-wl-phone">
          {t("phone")}
          {!cfg.widget.requirePhone ? ` (${t("optional")})` : ""}
        </label>
        <input
          id="sitli-wl-phone"
          type="tel"
          required={cfg.widget.requirePhone}
          autocomplete="tel"
          inputMode="tel"
          value={g.phone}
          onInput={(e) => update({ phone: (e.target as HTMLInputElement).value })}
        />
      </div>
      <div class="field">
        <label for="sitli-wl-notes">{t("notes")}</label>
        <textarea
          id="sitli-wl-notes"
          maxLength={1000}
          value={g.notes}
          onInput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value })}
        />
      </div>
      {error.value ? <ErrorBox>{error.value}</ErrorBox> : null}
      <div class="actions">
        <button type="button" class="btn secondary" onClick={back}>
          {t("back")}
        </button>
        <button type="submit" class="btn" disabled={busy.value}>
          {busy.value ? t("waitlist.submitting") : t("waitlist.submit")}
        </button>
      </div>
    </form>
  );
}

export function WaitlistDone({ entry }: { entry: PublicWaitlistEntryDto }) {
  return (
    <div class="done">
      <DoneIcon kind="wait" />
      <h1>{t("waitlist.doneTitle")}</h1>
      <p class="sub">{t("waitlist.doneText")}</p>
      <div class="summary">
        <div>
          <span>{t("date")}</span>
          <strong>{formatDateLong(entry.serviceDate, locale.value)}</strong>
        </div>
        <div>
          <span>{t("guests")}</span>
          <strong>
            {entry.partySize === 1 ? t("guestsOne") : t("guestsMany", { n: entry.partySize })}
          </strong>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn secondary" onClick={reset}>
          {t("back")}
        </button>
        <a class="btn" href={entry.manageUrl} target="_blank" rel="noreferrer">
          {t("waitlist.viewRequest")}
        </a>
      </div>
    </div>
  );
}
