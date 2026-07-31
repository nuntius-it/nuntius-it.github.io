import { describe, it, expect } from "vitest";
import { normalizeMobile, isMobile, pickMobile, dedupePhones } from "../src/lib/phone.js";

describe("normalizeMobile", () => {
  it("normalizza un cellulare nazionale a 10 cifre", () => {
    expect(normalizeMobile("3471234567")).toBe("+393471234567");
  });

  it("accetta spazi, punti e trattini", () => {
    expect(normalizeMobile("347 123.45-67")).toBe("+393471234567");
  });

  it("accetta i prefissi +39, 0039 e 39", () => {
    expect(normalizeMobile("+39 3471234567")).toBe("+393471234567");
    expect(normalizeMobile("00393471234567")).toBe("+393471234567");
    expect(normalizeMobile("393471234567")).toBe("+393471234567");
  });

  it("non confonde un cellulare che inizia per 39 col prefisso internazionale", () => {
    expect(normalizeMobile("3931234567")).toBe("+393931234567");
  });

  it("rifiuta i numeri fissi", () => {
    expect(normalizeMobile("0883584584")).toBeNull();
  });

  it("rifiuta valori vuoti o non numerici", () => {
    expect(normalizeMobile("")).toBeNull();
    expect(normalizeMobile(null)).toBeNull();
    expect(normalizeMobile(undefined)).toBeNull();
    expect(normalizeMobile("n.d.")).toBeNull();
  });

  it("rifiuta lunghezze non plausibili", () => {
    expect(normalizeMobile("347123")).toBeNull();
    expect(normalizeMobile("34712345678999")).toBeNull();
  });
});

describe("isMobile", () => {
  it("distingue cellulari e fissi", () => {
    expect(isMobile("3471234567")).toBe(true);
    expect(isMobile("0883584584")).toBe(false);
  });
});

describe("pickMobile", () => {
  it("preferisce il cellulare", () => {
    expect(pickMobile({ cellulare: "3471234567", telefono: "0883584584" })).toBe(
      "+393471234567"
    );
  });

  it("ripiega sul telefono solo se è un cellulare", () => {
    expect(pickMobile({ cellulare: "", telefono: "3489876543" })).toBe("+393489876543");
    expect(pickMobile({ cellulare: "", telefono: "0883584584" })).toBeNull();
  });

  it("gestisce persona senza numeri", () => {
    expect(pickMobile({})).toBeNull();
  });
});

describe("dedupePhones", () => {
  it("deduplica lo stesso numero in formati diversi (fratelli stesso genitore)", () => {
    expect(
      dedupePhones(["3471234567", "+39 347 1234567", "3489876543", "00393471234567"])
    ).toEqual(["+393471234567", "+393489876543"]);
  });

  it("scarta i numeri non validi preservando l'ordine", () => {
    expect(dedupePhones(["0883584584", "3471234567", ""])).toEqual(["+393471234567"]);
  });

  it("lista vuota o assente", () => {
    expect(dedupePhones([])).toEqual([]);
    expect(dedupePhones(undefined)).toEqual([]);
  });
});
