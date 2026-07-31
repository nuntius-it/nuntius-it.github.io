import { describe, it, expect } from "vitest";
import { buildImportPlan, personaKey, vocePersonaFields } from "../src/lib/importPlan.js";
import { parseUnioCsv } from "../src/lib/unioCsv.js";

const CSV = "﻿Gruppo; Anno; Tipo; Cognome; Nome; Data_nascita; Indirizzo; Comune; Telefono; Cellulare; Email\n" +
  "Catechismo;2025/2026;Responsabile;Verdi;Anna;01/01/1980;Via Roma 1;76125 Trani (BT);0883000000;3471111111;anna@example.org\n" +
  "Catechismo;2025/2026;Partecipante;Rossi;Luca;13/09/2012;Via Milano 2;76125 Trani (BT);3402222222;3483333333;\n" +
  "Catechismo;2025/2026;Partecipante;Rossi;Sara;24/11/2010;Via Milano 2;76125 Trani (BT);3402222222;3483333333;\n" +
  "Catechismo;2025/2026;Partecipante;Neri;Rita;15/04/2011;Via Bari 3;76125 Trani (BT);0883111111;;\n";

describe("personaKey", () => {
  it("è case-insensitive e ignora spazi doppi", () => {
    expect(personaKey("Di  Bari", "MARIA", "2012-01-01")).toBe(
      personaKey("di bari", "Maria", "2012-01-01")
    );
  });
});

describe("buildImportPlan", () => {
  const { persone } = parseUnioCsv(CSV);

  it("segna tutte come nuove su database vuoto", () => {
    const plan = buildImportPlan(persone, []);
    expect(plan.stats).toEqual({
      totale: 4, nuove: 4, esistenti: 0, senzaNumero: 1, numeriUnici: 2,
    });
    expect(plan.suggerimenti).toEqual({ nome: "Catechismo", anno: "2025/2026" });
  });

  it("riconosce le persone già presenti (re-import non duplica)", () => {
    const esistenti = [
      { id: "x1", cognome: "Rossi", nome: "Luca", data_nascita: "2012-09-13" },
    ];
    const plan = buildImportPlan(persone, esistenti);
    expect(plan.stats.esistenti).toBe(1);
    expect(plan.stats.nuove).toBe(3);
    expect(plan.voci.find((v) => v.riga.nome === "Luca").esistenteId).toBe("x1");
  });

  it("normalizza data e numero nella voce", () => {
    const plan = buildImportPlan(persone, []);
    const luca = plan.voci.find((v) => v.riga.nome === "Luca");
    expect(luca.dataNascitaIso).toBe("2012-09-13");
    expect(luca.numero).toBe("+393483333333");
    expect(luca.tipo).toBe("Partecipante");
  });

  it("vocePersonaFields prepara i campi db", () => {
    const plan = buildImportPlan(persone, []);
    const rita = plan.voci.find((v) => v.riga.nome === "Rita");
    const fields = vocePersonaFields(rita);
    expect(fields).toMatchObject({
      cognome: "Neri", nome: "Rita", data_nascita: "2011-04-15",
      cellulare: null, email: null,
    });
    expect(fields.telefono_raw).toBe("0883111111");
  });
});
