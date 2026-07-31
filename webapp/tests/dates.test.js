import { describe, it, expect } from "vitest";
import { parseItalianDate, formatItalianDate, birthYear } from "../src/lib/dates.js";
import { classeLabel, indiceClasse, annoScolasticoCorrente } from "../src/lib/scuola.js";

describe("parseItalianDate", () => {
  it("converte gg/mm/aaaa in ISO", () => {
    expect(parseItalianDate("13/09/2012")).toBe("2012-09-13");
    expect(parseItalianDate("4/1/2013")).toBe("2013-01-04");
  });
  it("rifiuta valori non validi", () => {
    expect(parseItalianDate("")).toBeNull();
    expect(parseItalianDate("2012-09-13")).toBeNull();
    expect(parseItalianDate("32/01/2012")).toBeNull();
    expect(parseItalianDate("01/13/2012")).toBeNull();
  });
});

describe("formatItalianDate", () => {
  it("converte ISO in gg/mm/aaaa", () => {
    expect(formatItalianDate("2012-09-13")).toBe("13/09/2012");
    expect(formatItalianDate(null)).toBe("");
  });
});

describe("birthYear", () => {
  it("estrae l'anno da entrambi i formati", () => {
    expect(birthYear("13/09/2012")).toBe(2012);
    expect(birthYear("2012-09-13")).toBe(2012);
    expect(birthYear("boh")).toBeNull();
  });
});

describe("classe scolastica", () => {
  it("nato 2012 nell'anno scolastico 2025/26 → 3ª media", () => {
    expect(classeLabel(2012, 2025)).toBe("3ª media");
  });
  it("nato 2019 nel 2025/26 → 1ª elementare", () => {
    expect(classeLabel(2019, 2025)).toBe("1ª elementare");
  });
  it("fuori dal range scolastico → null", () => {
    expect(classeLabel(1980, 2025)).toBeNull();
    expect(classeLabel(2024, 2025)).toBeNull();
  });
  it("indiceClasse per il filtro 'dalla 5ª elementare in su'", () => {
    // 5ª elementare = indice 5: nel 2025/26 sono i nati 2015 o prima
    expect(indiceClasse(2015, 2025)).toBe(5);
    expect(indiceClasse(2016, 2025)).toBe(4);
  });
  it("anno scolastico corrente: settembre cambia anno", () => {
    expect(annoScolasticoCorrente(new Date("2026-07-31"))).toBe(2025);
    expect(annoScolasticoCorrente(new Date("2026-09-15"))).toBe(2026);
  });
});
