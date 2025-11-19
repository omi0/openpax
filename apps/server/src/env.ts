import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  APP_ENCRYPTION_KEY: z
    .string()
    .min(1, "APP_ENCRYPTION_KEY is required")
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "APP_ENCRYPTION_KEY must be 32 bytes, base64 encoded",
    ),
  PUBLIC_URL: z.url().transform((v) => v.replace(/\/+$/, "")),
  DASHBOARD_ORIGIN: z.url().optional(),
  SMTP_URL: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "silent"]).default("info"),
  TRUST_PROXY: z.coerce.boolean().default(false),
  SECURE_COOKIES: z.coerce.boolean().optional(),
  /** api = HTTP only, worker = jobs only, all = both (default). */
  ROLE: z.enum(["api", "worker", "all"]).default("all"),
  DASHBOARD_DIST: z.string().optional(),
  WIDGET_DIST: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
