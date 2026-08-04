/**
 * Test dello strato dati locale SQLite (sender/db/), sostituisce il vecchio
 * test di integrazione contro Supabase. Gira in-memory con il prebuild N-API
 * di better-sqlite3 (stesso binario usato dall'app dentro Electron).
 */
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { creaDb } from "../../sender/db/db.js";
import { migra, VERSIONE_SCHEMA } from "../../sender/db/schema.js";

const voce = (cognome, nome, extra = {}) => ({
  esistenteId: null,
  tipo: "Partecipante",
  ...extra,
  campi: {
    cognome,
    nome,
    data_nascita: "2015-03-02",
    cellulare: "+393331234567",
    cellulare_raw: "333 1234567",
    telefono_raw: "",
    email: null,
    indirizzo: null,
    comune: null,
    ...(extra.campi ?? {}),
  },
});

describe("schema locale", () => {
  it("crea lo schema e imposta user_version", () => {
    const api = creaDb(Database, ":memory:");
    expect(api.db.pragma("user_version", { simple: true })).toBe(VERSIONE_SCHEMA);
    expect(api.db.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("migra è idempotente su un db già aggiornato", () => {
    const api = creaDb(Database, ":memory:");
    expect(migra(api.db)).toBe(VERSIONE_SCHEMA);
  });
});

describe("dati locali", () => {
  let d;
  beforeEach(() => {
    d = creaDb(Database, ":memory:");
  });

  it("impostazioni e profilo", () => {
    expect(d.getProfilo()).toBeNull();
    d.setImpostazione("nome_parrocchia", "Parrocchia S. Nicola (demo)");
    d.setImpostazione("nome_parrocchia", "Parrocchia S. Nicola (demo)"); // upsert
    expect(d.getProfilo()).toEqual({ nomeParrocchia: "Parrocchia S. Nicola (demo)" });
    expect(d.getImpostazione("inesistente")).toBeNull();
  });

  it("importaGruppo inserisce gruppo, persone e appartenenze", () => {
    const esito = d.importaGruppo({
      nome: "Catechismo — 3a media",
      anno: "2025/2026",
      attivita: "Catechismo",
      voci: [
        voce("Rossi", "Anna"),
        voce("Verdi", "Luca"),
        voce("Bianchi", "Suor Pia", { tipo: "Responsabile" }),
      ],
    });
    expect(esito.inserite).toBe(3);
    expect(esito.aggiornate).toBe(0);

    const gruppi = d.fetchGruppi();
    expect(gruppi).toHaveLength(1);
    expect(gruppi[0].partecipanti).toBe(3);

    const { gruppo, persone } = d.fetchGruppo(esito.gruppoId);
    expect(gruppo.nome).toBe("Catechismo — 3a media");
    // Responsabili prima, poi per cognome
    expect(persone.map((p) => p.cognome)).toEqual(["Bianchi", "Rossi", "Verdi"]);
    expect(persone[0].tipo).toBe("Responsabile");
  });

  it("il reimport aggiorna i contatti senza duplicare persone né appartenenze", () => {
    const primo = d.importaGruppo({
      nome: "ACR", anno: "2025/2026", attivita: "ACR",
      voci: [voce("Rossi", "Anna")],
    });
    const [anna] = d.fetchPersoneMinime();
    const secondo = d.importaGruppo({
      nome: "ACR", anno: "2025/2026", attivita: "ACR",
      voci: [voce("Rossi", "Anna", {
        esistenteId: anna.id,
        campi: { cellulare: "+393399999999" },
      })],
    });
    expect(secondo.gruppoId).toBe(primo.gruppoId); // upsert su (nome, anno)
    expect(secondo.inserite).toBe(0);
    expect(secondo.aggiornate).toBe(1);
    expect(d.fetchPersoneMinime()).toHaveLength(1);
    expect(d.fetchGruppi()[0].partecipanti).toBe(1);
    expect(d.fetchPersone()[0].cellulare).toBe("+393399999999");
  });

  it("persone: crea, aggiorna, appartenenze in fetchPersone", () => {
    const p = d.creaPersona({ cognome: "Russo", nome: "Marta", note: "allergie: no" });
    expect(p.id).toBeTruthy();
    expect(p.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    d.aggiornaPersona(p.id, { email: "marta@example.org", campo_ignoto: "via" });
    const [letta] = d.fetchPersone();
    expect(letta.email).toBe("marta@example.org");
    expect(letta.campo_ignoto).toBeUndefined();
    // updated_at viene riscritto dall'orologio JS (quello di creazione dal
    // clock di SQLite): niente confronti d'ordine tra i due, solo il formato.
    expect(letta.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(letta.appartenenze).toEqual([]);

    const { gruppoId } = d.importaGruppo({ nome: "Coro", anno: null, attivita: null, voci: [] });
    d.aggiungiAlGruppo(gruppoId, p.id);
    d.aggiungiAlGruppo(gruppoId, p.id, "Responsabile"); // upsert cambia il tipo
    expect(d.fetchPersone()[0].appartenenze).toEqual([
      { gruppo_id: gruppoId, tipo: "Responsabile" },
    ]);

    d.rimuoviDalGruppo(gruppoId, p.id);
    expect(d.fetchGruppi()[0].partecipanti).toBe(0);
  });

  it("eliminaGruppo elimina le appartenenze ma non le persone", () => {
    const { gruppoId } = d.importaGruppo({
      nome: "Scout", anno: "2025/2026", attivita: null, voci: [voce("Neri", "Ugo")],
    });
    d.eliminaGruppo(gruppoId);
    expect(d.fetchGruppi()).toHaveLength(0);
    expect(d.fetchPersoneMinime()).toHaveLength(1);
    expect(d.fetchPersone()[0].appartenenze).toEqual([]);
  });

  it("liste: ciclo completo", () => {
    const a = d.creaPersona({ cognome: "Rossi", nome: "Anna" });
    const b = d.creaPersona({ cognome: "Verdi", nome: "Luca" });
    const lista = d.creaLista("Festa di Carnevale", "solo 3a media", [a.id]);

    expect(d.fetchListe()).toMatchObject([{ nome: "Festa di Carnevale", persone: 1 }]);

    d.aggiungiALista(lista.id, [a.id, b.id]); // idempotente su a
    const { persone } = d.fetchLista(lista.id);
    expect(persone.map((p) => p.cognome)).toEqual(["Rossi", "Verdi"]);

    d.aggiornaLista(lista.id, { nome: "Carnevale 2027" });
    expect(d.fetchLista(lista.id).lista.nome).toBe("Carnevale 2027");

    d.rimuoviDaLista(lista.id, a.id);
    expect(d.fetchListe()[0].persone).toBe(1);

    d.eliminaLista(lista.id);
    expect(d.fetchListe()).toHaveLength(0);
    expect(d.fetchPersoneMinime()).toHaveLength(2); // le persone restano
  });

  it("template: salva, elenca, elimina", () => {
    d.salvaTemplate("Promemoria", "Ciao {nome}, ci vediamo domenica!");
    const [t] = d.fetchTemplates();
    expect(t.titolo).toBe("Promemoria");
    d.eliminaTemplate(t.id);
    expect(d.fetchTemplates()).toHaveLength(0);
  });

  it("campagne: creazione con destinatari e ciclo di invio", () => {
    const p = d.creaPersona({ cognome: "Rossi", nome: "Anna", cellulare: "+393331234567" });
    const campagna = d.creaCampagna({
      titolo: "Avvisi domenica",
      testo: "Messa alle 10.",
      stato: "pronta",
      destinatari: [
        { persona_id: p.id, numero: "+393331234567" },
        { persona_id: null, numero: "+393407654321" },
      ],
    });

    expect(d.fetchCampagne()).toMatchObject([{ titolo: "Avvisi domenica", destinatari: 2 }]);
    expect(d.fetchCampagnePronte()).toMatchObject([{ id: campagna.id, testo: "Messa alle 10." }]);

    const coda = d.fetchCodaInvii(campagna.id);
    expect(coda).toHaveLength(2);

    d.cambiaStatoCampagna(campagna.id, "in_invio");
    d.aggiornaInvio(coda[0].id, { esito: "inviato", inviato_at: new Date().toISOString() });
    d.aggiornaInvio(coda[1].id, { esito: "errore", dettaglio: "numero non valido" });
    d.cambiaStatoCampagna(campagna.id, "completata");

    expect(d.fetchCodaInvii(campagna.id)).toHaveLength(0);
    expect(d.fetchCampagnePronte()).toHaveLength(0);

    const { campagna: letta, invii } = d.fetchCampagna(campagna.id);
    expect(letta.stato).toBe("completata");
    expect(invii.map((i) => i.esito).sort()).toEqual(["errore", "inviato"]);
    const conPersona = invii.find((i) => i.persone);
    expect(conPersona.persone).toEqual({ cognome: "Rossi", nome: "Anna" });
    expect(invii.find((i) => !i.persone).persone).toBeNull();
  });

  it("uno stato campagna non previsto viene rifiutato dal CHECK", () => {
    expect(() => d.creaCampagna({ titolo: "X", testo: "y", stato: "inviata", destinatari: [] }))
      .toThrow(/CHECK/i);
  });

  it("eliminare una persona conserva gli invii (persona_id a null)", () => {
    const p = d.creaPersona({ cognome: "Rossi", nome: "Anna" });
    const campagna = d.creaCampagna({
      titolo: "T", testo: "t",
      destinatari: [{ persona_id: p.id, numero: "+393331234567" }],
    });
    d.db.prepare("delete from persone where id = ?").run(p.id);
    const { invii } = d.fetchCampagna(campagna.id);
    expect(invii).toHaveLength(1);
    expect(invii[0].numero).toBe("+393331234567");
    expect(invii[0].persone).toBeNull();
  });

  it("eliminaCampagna elimina in cascata gli invii", () => {
    const campagna = d.creaCampagna({
      titolo: "T", testo: "t",
      destinatari: [{ persona_id: null, numero: "+393331234567" }],
    });
    d.eliminaCampagna(campagna.id);
    expect(d.db.prepare("select count(*) c from invii").get().c).toBe(0);
  });
});
