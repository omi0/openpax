import { addDays, addMonths, formatMonth, monthGrid, monthOf } from "../dates.js";
import { dict, locale, t } from "../i18n.js";
import {
  config,
  date,
  month,
  openDates,
  partySize,
  selectDate,
  selectPartySize,
  setMonth,
  today,
} from "../state.js";
import { ChevronIcon, formatDateShort } from "./chrome.js";

export function PartyDatePicker() {
  const cfg = config.value;
  if (!cfg) return null;
  const sizes: number[] = [];
  for (
    let n = cfg.policy.minPartySize;
    n <= Math.min(cfg.policy.maxPartySize, cfg.policy.minPartySize + 11);
    n += 1
  )
    sizes.push(n);
  const maxDate = addDays(today.value, cfg.policy.maxAdvanceDays);
  const largest = sizes[sizes.length - 1] ?? cfg.policy.maxPartySize;
  const phone = cfg.restaurant.phone;
  const grid = monthGrid(month.value);
  const canGoPrev = month.value > monthOf(today.value);
  const canGoNext = month.value < monthOf(maxDate);

  return (
    <div>
      <span class="label">
        {t("guests")}
        <span class="value">
          {partySize.value === 1 ? t("guestsOne") : t("guestsMany", { n: partySize.value })}
        </span>
      </span>
      <div class="row">
        {sizes.map((n) => (
          <button
            key={n}
            type="button"
            class="chip"
            aria-pressed={partySize.value === n}
            onClick={() => void selectPartySize(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p class="fine larger">
        {phone ? t("largerParty", { n: largest, phone }) : t("largerPartyNoPhone", { n: largest })}
      </p>

      <span class="label">
        {t("date")}
        {date.value ? <span class="value">{formatDateShort(date.value, locale.value)}</span> : null}
      </span>
      <div class="cal-head">
        <button
          type="button"
          class="cal-nav"
          aria-label={t("prevMonth")}
          disabled={!canGoPrev}
          onClick={() => void setMonth(addMonths(month.value, -1))}
        >
          <ChevronIcon dir="left" />
        </button>
        <strong>{formatMonth(month.value, locale.value)}</strong>
        <button
          type="button"
          class="cal-nav"
          aria-label={t("nextMonth")}
          disabled={!canGoNext}
          onClick={() => void setMonth(addMonths(month.value, 1))}
        >
          <ChevronIcon dir="right" />
        </button>
      </div>
      <div class="cal">
        {dict().weekdays.map((wd) => (
          <div key={wd} class="wd">
            {wd}
          </div>
        ))}
        {grid.flat().map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              class={`${openDates.value.has(d) ? "open" : ""} ${date.value === d ? "selected" : ""} ${today.value === d ? "today" : ""}`}
              aria-pressed={date.value === d}
              aria-current={today.value === d ? "date" : undefined}
              disabled={d < today.value || d > maxDate || !openDates.value.has(d)}
              onClick={() => void selectDate(d)}
            >
              {Number(d.slice(8, 10))}
            </button>
          ) : (
            <div key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
