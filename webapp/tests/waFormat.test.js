import { describe, it, expect } from "vitest";
import { waToHtml } from "../src/lib/waFormat.js";
import { buildDestinatari } from "../src/lib/campagna.js";

describe("waToHtml", () => {
  it("rende grassetto, corsivo e barrato", () => {
    expect(waToHtml("*ciao* _mondo_ ~vecchio~")).toBe(
      "<strong>ciao</strong> <em>mondo</em> <s>vecchio</s>"
    );
  });
  it("non formatta marcatori con spazi interni (come WhatsApp)", () => {
    expect(waToHtml("* no *")).toBe("* no *");
  });
  it("escapa l'HTML prima di formattare", () => {
    expect(waToHtml("<b>x</b> *ok*")).toBe("&lt;b&gt;x&lt;/b&gt; <strong>ok</strong>");
  });
  it("converte gli a capo", () => {
    expect(waToHtml("riga1\nriga2")).toBe("riga1<br>riga2");
  });
  it("gestisce input vuoto", () => {
    expect(waToHtml("")).toBe("");
    expect(waToHtml(null)).toBe("");
  });
});

describe("buildDestinatari", () => {
  it("un invio per numero, senza-cellulare esclusi", () => {
    const persone = [
      { id: "a", cellulare: "+393471111111" },
      { id: "b", cellulare: "+393471111111" }, // fratello: stesso numero
      { id: "c", cellulare: "+393482222222" },
      { id: "d", cellulare: null },
    ];
    const { destinatari, esclusi } = buildDestinatari(persone);
    expect(destinatari).toEqual([
      { persona_id: "a", numero: "+393471111111" },
      { persona_id: "c", numero: "+393482222222" },
    ]);
    expect(esclusi.map((p) => p.id)).toEqual(["d"]);
  });
  it("lista vuota", () => {
    expect(buildDestinatari([])).toEqual({ destinatari: [], esclusi: [] });
  });
});
