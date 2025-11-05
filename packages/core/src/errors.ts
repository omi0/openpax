export type DomainErrorCode =
  | "invalid_input"
  | "invalid_service"
  | "invalid_transition"
  | "slot_unavailable"
  | "policy_violation"
  | "not_found";

export class DomainError extends Error {
  constructor(
    public readonly code: DomainErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class SlotUnavailableError extends DomainError {
  constructor(
    public readonly reason: string,
    details?: Record<string, unknown>,
  ) {
    super("slot_unavailable", `Slot is not available: ${reason}`, { reason, ...details });
    this.name = "SlotUnavailableError";
  }
}

export class PolicyViolationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("policy_violation", message, details);
    this.name = "PolicyViolationError";
  }
}
