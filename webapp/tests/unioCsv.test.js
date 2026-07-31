import { describe, it, expect } from "vitest";
import { parseUnioCsv } from "../src/lib/unioCsv.js";
import { pickMobile, dedupePhones } from "../src/lib/phone.js";

// Fixture sintetica nel formato reale dell'export UNIO (dati inventati).
const CSV = "﻿Gruppo; Anno; Tipo; Cognome; Nome; Data_nascita; Indirizzo; Comune; Telefono; Cellulare; Email\n" +
  "Catechismo;2025/2026;Responsabile;Verdi;Anna;01/01/1980;Via Roma 1;76125 Trani (BT);0883000000;3471111111;anna@example.org\n" +
  "Catechismo;2025/2026;Partecipante;Rossi;Luca;13/09/2012;Via Milano 2;76125 Trani (BT);3402222222;3483333333;\n" +
  "Catechismo;2025/2026;Partecipante;Rossi;Sara;24/11/2010;Via Milano 2;76125 Trani (BT);3402222222;3483333333;mamma@example.org\n" +
  "Catechismo;2025/2026;Partecipante;Bianchi;Elia;07/01/2013;;;;3404444444;\n" +
  "Catechismo;2025/2026;Partecipante;Neri;Rita;15/04/2011;Via Bari 3;76125 Trani (BT);0883111111;;\n";

describe("parseUnioCsv", () => {
  it("legge l'export UNIO con BOM e separatore ;", () => {
    const { persone, errori } = parseUnioCsv(CSV);
    expect(errori).toEqual([]);
    expect(persone).toHaveLength(5);
    expect(persone[0]).toMatchObject({
      gruppo: "Catechismo",
      anno: "2025/2026",
      tipo: "Responsabile",
      cognome: "Verdi",
      nome: "Anna",
      dataNascita: "01/01/1980",
      cellulare: "3471111111",
      email: "anna@example.org",
    });
  });

  it("gestisce campi vuoti (indirizzo/cellulare mancanti)", () => {
    const { persone } = parseUnioCsv(CSV);
    const elia = persone.find((p) => p.nome === "Elia");
    expect(elia.indirizzo).toBe("");
    expect(elia.telefono).toBe("");
    expect(elia.cellulare).toBe("3404444444");
  });

  it("rifiuta file che non sembrano export UNIO", () => {
    const { persone, errori } = parseUnioCsv("a,b,c\n1,2,3\n");
    expect(persone).toEqual([]);
    expect(errori).toHaveLength(1);
    expect(errori[0]).toContain("UNIO");
  });

  it("rifiuta file vuoti", () => {
    const { errori } = parseUnioCsv("");
    expect(errori).toHaveLength(1);
  });

  it("ignora righe senza nominativo segnalandole", () => {
    const csv =
      "Cognome;Nome;Cellulare\nRossi;Luca;3471234567\n;;3339999999\n";
    const { persone, errori } = parseUnioCsv(csv);
    expect(persone).toHaveLength(1);
    expect(errori).toHaveLength(1);
    expect(errori[0]).toContain("Riga 3");
  });
});

describe("flusso import → numeri da contattare", () => {
  it("da export UNIO a lista numeri unici (fratelli deduplicati, fissi esclusi)", () => {
    const { persone } = parseUnioCsv(CSV);
    const numeri = dedupePhones(persone.map((p) => pickMobile(p)));
    // Anna, Luca+Sara (stesso numero → 1), Elia; Rita ha solo il fisso → esclusa.
    expect(numeri).toEqual(["+393471111111", "+393483333333", "+393404444444"]);
  });
});
