/**
 * Small RFC 4180 CSV reader/writer. Handles quoted fields, embedded
 * delimiters and newlines, CRLF, a UTF-8 BOM, and auto-detects `;` as the
 * delimiter (what Italian Excel produces).
 */

export interface ParsedCsv {
  /** Lower-cased, trimmed header cells. */
  header: string[];
  /** One object per data row, keyed by header; missing cells are "". */
  rows: Array<Record<string, string>>;
  delimiter: "," | ";" | "\t";
}

export function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","] && counts["\t"] > counts[";"]) return "\t";
  return ",";
}

/** Split CSV text into records of cells. */
export function parseCsvRecords(text: string, delimiter?: "," | ";" | "\t"): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const sep = delimiter ?? detectDelimiter(firstLine);
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    records.push(row);
  }
  return records.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parse with a header row; header names are normalised to lower snake case. */
export function parseCsv(text: string): ParsedCsv {
  const firstLine =
    (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const records = parseCsvRecords(text, delimiter);
  const [head, ...body] = records;
  const header = (head ?? []).map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  );
  const rows = body.map((cells) => {
    const out: Record<string, string> = {};
    header.forEach((key, i) => {
      out[key] = (cells[i] ?? "").trim();
    });
    return out;
  });
  return { header, rows, delimiter };
}

const needsQuotes = /[",;\t\n\r]/;

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  return needsQuotes.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise rows (in header order) with CRLF line endings and a BOM so Excel opens it as UTF-8. */
export function toCsv(
  header: string[],
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
): string {
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) lines.push(header.map((h) => csvCell(row[h])).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
