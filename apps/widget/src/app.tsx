import { useEffect } from "preact/hooks";
import { formatDateShort, Header, Loading, Steps } from "./components/chrome.js";
import { Confirmation } from "./components/confirmation.js";
import { FeedbackPage } from "./components/feedback-page.js";
import { GuestForm } from "./components/guest-form.js";
import { Manage } from "./components/manage.js";
import { PartyDatePicker } from "./components/party-date-picker.js";
import { SlotGrid } from "./components/slot-grid.js";
import { WaitlistDone, WaitlistForm } from "./components/waitlist-form.js";
import { WaitlistPage } from "./components/waitlist-page.js";
import { locale, setLocale, t } from "./i18n.js";
import { scrollParentToTop } from "./resize.js";
import {
  config,
  date,
  loadConfig,
  loadError,
  partySize,
  result,
  selectedServiceName,
  selectedSlot,
  step,
  waitlistResult,
} from "./state.js";

export interface Route {
  slug: string;
  token: string | null;
  /** What the token in the URL refers to. */
  tokenKind: "manage" | "waitlist" | "feedback";
  embedded: boolean;
  instanceId: string | null;
  lang: string | null;
}

export function App({ route }: { route: Route }) {
  useEffect(() => {
    if (!route.token) void loadConfig(route.slug, route.lang);
    else if (route.lang) setLocale(route.lang);
  }, [route]);

  useEffect(() => {
    const cfg = config.value;
    if (cfg)
      document.documentElement.style.setProperty("--openpax-primary", cfg.widget.primaryColor);
  }, [config.value]);

  const cfg = config.value;
  const cls = `openpax ${route.embedded ? "" : "hosted"}`;

  if (route.token) {
    return (
      <div class={cls}>
        {route.tokenKind === "waitlist" ? (
          <WaitlistPage token={route.token} />
        ) : route.tokenKind === "feedback" ? (
          <FeedbackPage token={route.token} />
        ) : (
          <Manage token={route.token} />
        )}
        <Footer />
      </div>
    );
  }
  if (loadError.value) return <div class={cls}>{t(loadError.value)}</div>;
  if (!cfg)
    return (
      <div class={cls}>
        <Loading />
      </div>
    );

  const current =
    step.value === "done" || step.value === "waitlist_done"
      ? 4
      : step.value === "details" || step.value === "waitlist"
        ? 3
        : selectedSlot.value
          ? 2
          : 1;
  const slot = selectedSlot.value;
  const guestsLabel =
    partySize.value === 1 ? t("guestsOne") : t("guestsMany", { n: partySize.value });

  return (
    <div class={cls}>
      {step.value === "done" && result.value ? (
        <Confirmation booking={result.value} hosted={!route.embedded} />
      ) : step.value === "waitlist_done" && waitlistResult.value ? (
        <WaitlistDone entry={waitlistResult.value} />
      ) : step.value === "waitlist" ? (
        <>
          <Header title={cfg.restaurant.name} locales={cfg.widget.locales} />
          <Steps current={current} />
          <WaitlistForm onDone={() => scrollParentToTop(route.instanceId)} />
        </>
      ) : step.value === "details" ? (
        <>
          <Header title={cfg.restaurant.name} locales={cfg.widget.locales} />
          <Steps current={current} />
          <GuestForm onDone={() => scrollParentToTop(route.instanceId)} />
        </>
      ) : (
        <>
          <Header title={cfg.restaurant.name} subtitle={t("title")} locales={cfg.widget.locales} />
          <Steps current={current} />
          {cfg.widget.welcomeMessage ? <p class="welcome">{cfg.widget.welcomeMessage}</p> : null}
          <PartyDatePicker />
          <SlotGrid />
          <div class="summary-bar">
            <div class="summary-text">
              {slot ? (
                <>
                  <strong>
                    {guestsLabel} · {formatDateShort(date.value, locale.value)} · {slot.startLocal}
                  </strong>
                  {selectedServiceName.value ? <span>{selectedServiceName.value}</span> : null}
                </>
              ) : (
                <>
                  <strong>
                    {guestsLabel} · {formatDateShort(date.value, locale.value)}
                  </strong>
                  <span>{t("pickTime")}</span>
                </>
              )}
            </div>
            <button
              type="button"
              class="btn"
              disabled={!slot}
              onClick={() => {
                step.value = "details";
                scrollParentToTop(route.instanceId);
              }}
            >
              {t("continue")}
            </button>
          </div>
        </>
      )}
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <p class="powered">
      {t("poweredBy")}{" "}
      <a href="https://github.com/omi0/openpax" target="_blank" rel="noreferrer">
        OpenPax
      </a>
    </p>
  );
}
