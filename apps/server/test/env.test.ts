import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env.js";

const base = {
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
  APP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  PUBLIC_URL: "http://localhost:3000/",
};

describe("loadEnv", () => {
  it("parses boolean flags literally", () => {
    expect(loadEnv({ ...base, SECURE_COOKIES: "false", TRUST_PROXY: "false" })).toMatchObject({
      SECURE_COOKIES: false,
      TRUST_PROXY: false,
    });
    expect(loadEnv({ ...base, SECURE_COOKIES: "true", TRUST_PROXY: "1" })).toMatchObject({
      SECURE_COOKIES: true,
      TRUST_PROXY: true,
    });
    expect(loadEnv({ ...base, SECURE_COOKIES: "" })).toMatchObject({
      SECURE_COOKIES: undefined,
      TRUST_PROXY: false,
    });
  });

  it("strips trailing slashes from PUBLIC_URL and rejects bad keys", () => {
    expect(loadEnv(base).PUBLIC_URL).toBe("http://localhost:3000");
    expect(() => loadEnv({ ...base, APP_ENCRYPTION_KEY: "short" })).toThrow(/32 bytes/);
    expect(() => loadEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow(/32 characters/);
  });
});
