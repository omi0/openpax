import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc1";

export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(value: string): string;
  isEncrypted(value: unknown): value is string;
}

/** AES-256-GCM with a random IV per value; output is `enc1:<iv>:<tag>:<ciphertext>` (base64). */
export function createSecretBox(keyBase64: string): SecretBox {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [PREFIX, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(
        ":",
      );
    },
    decrypt(value) {
      const [prefix, ivB64, tagB64, ctB64] = value.split(":");
      if (prefix !== PREFIX || !ivB64 || !tagB64 || !ctB64)
        throw new Error("Not an encrypted value");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(ctB64, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
    isEncrypted(value): value is string {
      return typeof value === "string" && value.startsWith(`${PREFIX}:`);
    },
  };
}
