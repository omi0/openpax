import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvRecords, toCsv } from "../src/lib/csv.js";

describe("csv", () => {
  it("parses quoted cells, embedded separators, CRLF and a BOM", () => {
    const text =
      '﻿Name,Email,"Notes"\r\n"Rossi, Mario",mario@example.com,"Says ""ciao""\nand more"\r\n\r\nAnna,,\r\n';
    const parsed = parseCsv(text);
    expect(parsed.delimiter).toBe(",");
    expect(parsed.header).toEqual(["name", "email", "notes"]);
    expect(parsed.rows).toEqual([
      { name: "Rossi, Mario", email: "mario@example.com", notes: 'Says "ciao"\nand more' },
      { name: "Anna", email: "", notes: "" },
    ]);
  });

  it("detects the semicolon Excel uses in Italian locales and normalises headers", () => {
    const parsed = parseCsv("Nome Cliente;E-mail;Telefono\nMario;m@x.it;+39 333 1\n");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.header).toEqual(["nome_cliente", "e_mail", "telefono"]);
    expect(parsed.rows[0]).toEqual({
      nome_cliente: "Mario",
      e_mail: "m@x.it",
      telefono: "+39 333 1",
    });
    expect(parseCsvRecords("a\tb\n1\t2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("writes cells that round-trip through the parser", () => {
    const csv = toCsv(
      ["name", "note", "n"],
      [{ name: 'Lucia "Lu" Bianchi', note: "a, b\nc", n: 3 }],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(parseCsv(csv).rows).toEqual([{ name: 'Lucia "Lu" Bianchi', note: "a, b\nc", n: "3" }]);
  });
});
