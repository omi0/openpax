import { DomainError } from "../errors.js";
import { tablesExhausted } from "../tables/tables.js";
import { isLocalDate, weekdayOf } from "../time/local.js";
import { isValidTimeZone } from "../time/zoned.js";
import { evaluateCapacity } from "./capacity.js";
import { checkDatePolicy, checkPartyPolicy, checkServiceParty, checkSlotTiming } from "./policy.js";
import { enumerateSlots } from "./slots.js";
import type {
  AvailabilityInput,
  AvailabilityResult,
  BookabilityVerdict,
  Slot,
  SlotRequest,
  UnavailableReason,
} from "./types.js";
import { resolveServiceWindows } from "./windows.js";

function validateInput(input: AvailabilityInput): void {
  if (!isValidTimeZone(input.timezone)) {
    throw new DomainError("invalid_input", `Invalid timezone: ${input.timezone}`);
  }
  if (!isLocalDate(input.date)) {
    throw new DomainError("invalid_input", `Invalid date: ${input.date}`);
  }
}

/**
 * Pure availability computation for one restaurant date.
 * Returns every candidate slot of every open service, flagged available or
 * not, so callers can render greyed-out times and explain why.
 */
export function computeAvailability(input: AvailabilityInput): AvailabilityResult {
  validateInput(input);

  const reasons = new Set<UnavailableReason>();
  const dateReason = checkDatePolicy(input.date, input.now, input.timezone, input.policy);
  if (dateReason) reasons.add(dateReason);
  const partyReason = checkPartyPolicy(input.partySize, input.policy);
  if (partyReason) reasons.add(partyReason);

  const activeServices = input.services.filter((s) => s.active !== false);
  const weekday = weekdayOf(input.date);
  const areaId = input.areaId ?? null;
  const slots: Slot[] = [];
  let anyOpen = false;

  for (const service of activeServices) {
    const { closed, windows } = resolveServiceWindows(service, input.date, input.exceptions);
    if (closed) continue;
    anyOpen = true;

    const serviceParty = checkServiceParty(input.partySize, service);
    for (const candidate of enumerateSlots(service, windows, input.date, input.timezone)) {
      let reason: UnavailableReason | null =
        dateReason ??
        partyReason ??
        serviceParty ??
        checkSlotTiming(candidate.startsAt, input.now, input.policy);
      let remainingCovers: number | null = null;

      const capacity = evaluateCapacity(
        candidate,
        service,
        input.capacityRules,
        input.existingBookings,
        input.partySize,
        { serviceId: service.id, areaId, date: input.date, weekday, startMin: candidate.startMin },
      );
      remainingCovers = capacity.remainingCovers;
      if (reason === null && !capacity.ok) reason = capacity.reason ?? "full";
      // with a floor plan, a party also needs a table that is free for the whole visit
      if (
        reason === null &&
        input.tables &&
        tablesExhausted(input.tables, input.tableLoads ?? [], {
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          partySize: input.partySize,
          areaId,
        })
      )
        reason = "no_table";

      slots.push({
        serviceId: service.id,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        startLocal: candidate.startLocal,
        remainingCovers,
        available: reason === null,
        ...(reason !== null ? { reason } : {}),
      });
    }
  }

  if (!anyOpen) reasons.add(activeServices.length === 0 ? "no_service" : "closed");

  slots.sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.serviceId.localeCompare(b.serviceId),
  );

  return { date: input.date, closed: !anyOpen, reasons: [...reasons], slots };
}

/**
 * Re-check one requested slot with exactly the same logic the guest saw.
 * Used inside the booking transaction with fresh `existingBookings`.
 */
export function assertSlotBookable(
  input: AvailabilityInput,
  request: SlotRequest,
): BookabilityVerdict {
  const service = input.services.find((s) => s.id === request.serviceId);
  if (!service || service.active === false) return { ok: false, reason: "no_service" };

  const result = computeAvailability({
    ...input,
    services: [service],
    partySize: request.partySize ?? input.partySize,
  });
  const slot = result.slots.find((s) => s.startsAt.getTime() === request.startsAt.getTime());
  if (!slot) return { ok: false, reason: result.reasons[0] ?? "not_a_slot" };
  if (!slot.available) return { ok: false, reason: slot.reason ?? "full" };
  return { ok: true, slot, endsAt: slot.endsAt };
}
