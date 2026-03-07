import type { AvailabilitySlotDto } from "@sitli/shared";
import { t } from "../i18n.js";
import { availability, canJoinWaitlist, loadingSlots, selectedSlot, step } from "../state.js";
import { Loading } from "./chrome.js";

function WaitlistCta() {
  if (!canJoinWaitlist.value) return null;
  return (
    <div class="waitlist-cta">
      <p>{t("waitlist.full")}</p>
      <button
        type="button"
        class="btn secondary"
        onClick={() => {
          step.value = "waitlist";
        }}
      >
        {t("waitlist.join")}
      </button>
    </div>
  );
}

export function SlotGrid() {
  const data = availability.value;
  if (loadingSlots.value)
    return (
      <div>
        <span class="label">{t("time")}</span>
        <Loading />
      </div>
    );
  if (!data || data.closed)
    return (
      <div>
        <span class="label">{t("time")}</span>
        <p class="empty">{t("closed")}</p>
      </div>
    );
  if (data.slots.length === 0)
    return (
      <div>
        <span class="label">{t("time")}</span>
        <p class="empty">{t("noSlots")}</p>
        <WaitlistCta />
      </div>
    );

  const byService = new Map<string, AvailabilitySlotDto[]>();
  for (const s of data.slots)
    byService.set(s.serviceId, [...(byService.get(s.serviceId) ?? []), s]);
  const showServiceNames = byService.size > 1;

  return (
    <div>
      <span class="label">{t("time")}</span>
      {[...byService.entries()].map(([serviceId, slots]) => (
        <div key={serviceId}>
          {showServiceNames ? (
            <h3 class="group-label">{data.services.find((s) => s.id === serviceId)?.name}</h3>
          ) : null}
          <div class="slots">
            {slots.map((slot) => {
              const selected =
                selectedSlot.value?.startsAt === slot.startsAt &&
                selectedSlot.value?.serviceId === slot.serviceId;
              return (
                <button
                  key={`${slot.serviceId}-${slot.startsAt}`}
                  type="button"
                  class={`slot ${selected ? "selected" : ""}`}
                  aria-pressed={selected}
                  disabled={!slot.available}
                  onClick={() => {
                    selectedSlot.value = slot;
                  }}
                >
                  {slot.startLocal}
                  {!slot.available && slot.reason ? (
                    <small>{t(`reasons.${slot.reason}`)}</small>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <WaitlistCta />
    </div>
  );
}
