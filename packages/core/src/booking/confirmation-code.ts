/** Unambiguous alphabet (no 0/O, 1/I/L) for codes guests read over the phone. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generate a human-friendly confirmation code. `random` must return a float in
 * [0, 1); pass a CSPRNG-backed function in production.
 */
export function generateConfirmationCode(random: () => number, length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}
