import { signal } from "@preact/signals";
import { en } from "./locales/en.js";
import { type Dictionary, it } from "./locales/it.js";

export type Locale = "it" | "en";
const dictionaries: Record<Locale, Dictionary> = { it, en };

export const locale = signal<Locale>("it");

export function setLocale(value: string | null | undefined) {
  locale.value = value === "en" ? "en" : "it";
}

/** Tiny translator: `t("guestsMany", { n: 4 })`, nested keys via dots. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const dict: unknown = dictionaries[locale.value];
  const raw = key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
      dict,
    );
  if (typeof raw !== "string") return key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function dict(): Dictionary {
  return dictionaries[locale.value];
}
