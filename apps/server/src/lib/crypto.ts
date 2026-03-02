import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc1";

export interface SecretBox {
  encrypt(plain: string): string;
  /** Tries the current key, then every previous key. */
  decrypt(value: string): string;
  isEncrypted(value: unknown): value is string;
  /** True when the value only opens with a previous key: re-encrypt it with `rotate`. */
  needsRotation(value: string): boolean;
  /** The value re-encrypted under the current key, or null when it already is. */
  rotate(value: string): string | null;
}

function parseKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return key;
}

function decryptWith(key: Buffer, value: string): string {
  const [prefix, ivB64, tagB64, ctB64] = value.split(":");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !ctB64) throw new Error("Not an encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * AES-256-GCM with a random IV per value; output is `enc1:<iv>:<tag>:<ciphertext>` (base64).
 * Older keys stay readable during a rotation; new values always use the current key.
 */
export function createSecretBox(keyBase64: string, previousKeysBase64: string[] = []): SecretBox {
  const current = parseKey(keyBase64);
  const previous = previousKeysBase64.map(parseKey);

  const open = (value: string): { plain: string; stale: boolean } => {
    try {
      return { plain: decryptWith(current, value), stale: false };
    } catch (error) {
      for (const key of previous) {
        try {
          return { plain: decryptWith(key, value), stale: true };
        } catch {
          // try the next one
        }
      }
      throw error;
    }
  };

  const encrypt = (plain: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", current, iv);
    const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
  };

  return {
    encrypt,
    decrypt: (value) => open(value).plain,
    isEncrypted(value): value is string {
      return typeof value === "string" && value.startsWith(`${PREFIX}:`);
    },
    needsRotation: (value) => open(value).stale,
    rotate(value) {
      const { plain, stale } = open(value);
      return stale ? encrypt(plain) : null;
    },
  };
}
