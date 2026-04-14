import { randomBytes, randomInt } from "node:crypto";
import { generateConfirmationCode } from "@openpax/core";

const RANGE = 2 ** 48 - 1; // largest range randomInt accepts

/** Uniform float in [0, 1) backed by the CSPRNG. */
export function secureRandom(): number {
  return randomInt(0, RANGE) / RANGE;
}

export function newConfirmationCode(): string {
  return generateConfirmationCode(secureRandom, 6);
}

export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
