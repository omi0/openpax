import { useEffect } from "preact/hooks";
import { Confirmation } from "./components/confirmation.js";
import { GuestForm } from "./components/guest-form.js";
import { Manage } from "./components/manage.js";
import { PartyDatePicker } from "./components/party-date-picker.js";
import { SlotGrid } from "./components/slot-grid.js";
import { locale, setLocale, t } from "./i18n.js";
import { scrollParentToTop } from "./resize.js";
import { config, loadConfig, loadError, result, selectedSlot, step } from "./state.js";

export interface Route {
  slug: string;
  token: string | null;
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
    if (cfg) document.documentElement.style.setProperty("--sitli-primary", cfg.widget.primaryColor);
  }, [config.value]);

  const cfg = config.value;
  const cls = `sitli ${route.embedded ? "" : "hosted"}`;

  if (route.token) {
    return (
      <div class={cls}>
        <Manage token={route.token} />
        <Footer />
      </div>
    );
  }
  if (loadError.value) return <div class={cls}>{t(loadError.value)}</div>;
  if (!cfg) return <div class={cls}>…</div>;

  return (
    <div class={cls}>
      <div class="lang">
        {cfg.widget.locales.map((l) => (
          <button key={l} type="button" aria-pressed={locale.value === l} onClick={() => setLocale(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      {step.value === "done" && result.value ? (
        <Confirmation booking={result.value} hosted={!route.embedded} />
      ) : step.value === "details" ? (
        <>
          <h1>{cfg.restaurant.name}</h1>
          <GuestForm onDone={() => scrollParentToTop(route.instanceId)} />
        </>
      ) : (
        <>
          <h1>{cfg.restaurant.name}</h1>
          <p class="sub">{t("title")}</p>
          {cfg.widget.welcomeMessage ? <p class="welcome">{cfg.widget.welcomeMessage}</p> : null}
          <PartyDatePicker />
          <SlotGrid />
          <div class="actions">
            <button
              type="button"
              class="btn"
              disabled={!selectedSlot.value}
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
      <a href="https://github.com/omi0/sitli" target="_blank" rel="noreferrer">
        Sitli
      </a>
    </p>
  );
}
