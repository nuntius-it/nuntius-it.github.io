/**
 * Accesso dati locale (SQLite). Espone le stesse funzioni, con le stesse forme
 * di ritorno, di webapp/src/lib/db.js (versione Supabase), così le viste della
 * webapp non cambiano: il renderer le raggiunge via IPC con un proxy sottile.
 *
 * Unica differenza di contratto: importaGruppo riceve le voci già mappate
 * ({ esistenteId, tipo, campi }) — il proxy nel renderer applica
 * vocePersonaFields prima di attraversare l'IPC, così questo modulo non
 * dipende dalle lib ESM della webapp.
 *
 * Il costruttore del driver (better-sqlite3) è iniettato da fuori: il main
 * process passa il suo, i test passano quello dei devDependencies della webapp.
 */

const { randomUUID } = require("node:crypto");
const { migra } = require("./schema.js");

const CAMPI_PERSONA = [
  "cognome", "nome", "data_nascita", "cellulare", "telefono_raw",
  "cellulare_raw", "email", "indirizzo", "comune", "note",
];
const CAMPI_GRUPPO = ["nome", "attivita", "anno", "archiviato"];
const CAMPI_LISTA = ["nome", "descrizione"];
const CAMPI_INVIO = ["esito", "dettaglio", "inviato_at"];

const adesso = () => new Date().toISOString();

/** Filtra `campi` sulle sole colonne ammesse; ritorna [colonne, valori]. */
function ammessi(campi, colonne) {
  const coppie = Object.entries(campi ?? {}).filter(([k]) => colonne.includes(k));
  return [coppie.map(([k]) => k), coppie.map(([, v]) => normalizzaValore(v))];
}

/** SQLite non accetta boolean/undefined come bind parameter. */
function normalizzaValore(v) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

const perCognomeIt = (a, b) =>
  a.cognome.localeCompare(b.cognome, "it") || a.nome.localeCompare(b.nome, "it");

/**
 * Apre (creandolo/migrandolo se serve) il database e ritorna l'API dati.
 * @param {Function} Database costruttore di better-sqlite3
 * @param {string} percorso   file .db oppure ":memory:"
 */
function creaDb(Database, percorso) {
  const db = new Database(percorso);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migra(db);

  // ---------- Impostazioni / profilo ----------

  function getImpostazione(chiave) {
    return db.prepare("select valore from impostazioni where chiave = ?").get(chiave)?.valore ?? null;
  }

  function setImpostazione(chiave, valore) {
    db.prepare(
      "insert into impostazioni (chiave, valore) values (?, ?) on conflict (chiave) do update set valore = excluded.valore"
    ).run(chiave, normalizzaValore(valore));
  }

  /** null finché la parrocchia non è configurata (primo avvio). */
  function getProfilo() {
    const nome = getImpostazione("nome_parrocchia");
    return nome ? { nomeParrocchia: nome } : null;
  }

  // ---------- Gruppi ----------

  function fetchGruppi() {
    return db.prepare(`
      select g.id, g.nome, g.attivita, g.anno, g.archiviato,
             (select count(*) from appartenenze a where a.gruppo_id = g.id) as partecipanti
      from gruppi g where g.archiviato = 0
      order by g.anno desc, g.nome
    `).all().map((g) => ({ ...g, archiviato: Boolean(g.archiviato) }));
  }

  function fetchGruppo(id) {
    const gruppo = db.prepare("select * from gruppi where id = ?").get(id);
    if (!gruppo) throw new Error("Gruppo non trovato.");
    gruppo.archiviato = Boolean(gruppo.archiviato);
    const persone = db.prepare(`
      select p.*, a.tipo from appartenenze a
      join persone p on p.id = a.persona_id
      where a.gruppo_id = ?
    `).all(id).sort((a, b) =>
      (a.tipo === "Responsabile" ? 0 : 1) - (b.tipo === "Responsabile" ? 0 : 1) ||
      a.cognome.localeCompare(b.cognome, "it")
    );
    return { gruppo, persone };
  }

  function aggiornaGruppo(id, campi) {
    const [cols, vals] = ammessi(campi, CAMPI_GRUPPO);
    if (!cols.length) return;
    db.prepare(`update gruppi set ${cols.map((c) => `${c} = ?`).join(", ")} where id = ?`)
      .run(...vals, id);
  }

  function eliminaGruppo(id) {
    db.prepare("delete from gruppi where id = ?").run(id);
  }

  // ---------- Persone ----------

  function fetchPersone() {
    const persone = db.prepare(
      "select * from persone order by cognome collate nocase, nome collate nocase"
    ).all();
    const perPersona = new Map(persone.map((p) => [p.id, []]));
    for (const a of db.prepare("select persona_id, gruppo_id, tipo from appartenenze").all()) {
      perPersona.get(a.persona_id)?.push({ gruppo_id: a.gruppo_id, tipo: a.tipo });
    }
    return persone.map((p) => ({ ...p, appartenenze: perPersona.get(p.id) }));
  }

  function fetchPersoneMinime() {
    return db.prepare("select id, cognome, nome, data_nascita from persone").all();
  }

  function creaPersona(campi) {
    const [cols, vals] = ammessi(campi, CAMPI_PERSONA);
    return db.prepare(`
      insert into persone (id${cols.map((c) => `, ${c}`).join("")})
      values (?${cols.map(() => ", ?").join("")}) returning *
    `).get(randomUUID(), ...vals);
  }

  function aggiornaPersona(id, campi) {
    const [cols, vals] = ammessi(campi, CAMPI_PERSONA);
    if (!cols.length) return;
    db.prepare(`
      update persone set ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? where id = ?
    `).run(...vals, adesso(), id);
  }

  function aggiungiAlGruppo(gruppoId, personaId, tipo = "Partecipante") {
    db.prepare(`
      insert into appartenenze (persona_id, gruppo_id, tipo) values (?, ?, ?)
      on conflict (persona_id, gruppo_id) do update set tipo = excluded.tipo
    `).run(personaId, gruppoId, tipo);
  }

  function rimuoviDalGruppo(gruppoId, personaId) {
    db.prepare("delete from appartenenze where gruppo_id = ? and persona_id = ?")
      .run(gruppoId, personaId);
  }

  // ---------- Import ----------

  /**
   * Esegue il piano di import in un'unica transazione: upsert del gruppo,
   * insert delle persone nuove, update dei contatti delle esistenti, upsert
   * delle appartenenze.
   * @param {{nome, anno, attivita, voci: Array<{esistenteId, tipo, campi}>}} piano
   */
  const importaGruppo = db.transaction(({ nome, anno, attivita, voci }) => {
    const gruppo = db.prepare(`
      insert into gruppi (id, nome, anno, attivita) values (?, ?, ?, ?)
      on conflict (nome, anno) do update set attivita = excluded.attivita
      returning *
    `).get(randomUUID(), nome, anno, attivita);

    const nuove = voci.filter((v) => !v.esistenteId);
    const esistenti = voci.filter((v) => v.esistenteId);

    const ids = nuove.map((v) => creaPersona(v.campi).id);
    for (const v of esistenti) aggiornaPersona(v.esistenteId, v.campi);

    for (const [personaId, tipo] of [
      ...nuove.map((v, i) => [ids[i], v.tipo]),
      ...esistenti.map((v) => [v.esistenteId, v.tipo]),
    ]) {
      aggiungiAlGruppo(gruppo.id, personaId, tipo);
    }

    return { gruppoId: gruppo.id, inserite: nuove.length, aggiornate: esistenti.length };
  });

  // ---------- Liste ----------

  function fetchListe() {
    return db.prepare(`
      select l.id, l.nome, l.descrizione, l.created_at,
             (select count(*) from liste_persone lp where lp.lista_id = l.id) as persone
      from liste l order by l.created_at desc
    `).all();
  }

  const creaLista = db.transaction((nome, descrizione, personaIds) => {
    const lista = db.prepare(
      "insert into liste (id, nome, descrizione) values (?, ?, ?) returning *"
    ).get(randomUUID(), nome, descrizione ?? null);
    aggiungiALista(lista.id, personaIds ?? []);
    return lista;
  });

  function fetchLista(id) {
    const lista = db.prepare("select * from liste where id = ?").get(id);
    if (!lista) throw new Error("Lista non trovata.");
    const persone = db.prepare(`
      select p.* from liste_persone lp join persone p on p.id = lp.persona_id
      where lp.lista_id = ?
    `).all(id).sort(perCognomeIt);
    return { lista, persone };
  }

  function aggiornaLista(id, campi) {
    const [cols, vals] = ammessi(campi, CAMPI_LISTA);
    if (!cols.length) return;
    db.prepare(`update liste set ${cols.map((c) => `${c} = ?`).join(", ")} where id = ?`)
      .run(...vals, id);
  }

  function aggiungiALista(listaId, personaIds) {
    const ins = db.prepare(
      "insert into liste_persone (lista_id, persona_id) values (?, ?) on conflict do nothing"
    );
    for (const pid of personaIds) ins.run(listaId, pid);
  }

  function rimuoviDaLista(listaId, personaId) {
    db.prepare("delete from liste_persone where lista_id = ? and persona_id = ?")
      .run(listaId, personaId);
  }

  function eliminaLista(id) {
    db.prepare("delete from liste where id = ?").run(id);
  }

  // ---------- Template ----------

  function fetchTemplates() {
    return db.prepare("select * from template order by created_at desc").all();
  }

  function salvaTemplate(titolo, testo) {
    db.prepare("insert into template (id, titolo, testo) values (?, ?, ?)")
      .run(randomUUID(), titolo, testo);
  }

  function eliminaTemplate(id) {
    db.prepare("delete from template where id = ?").run(id);
  }

  // ---------- Campagne ----------

  const conteggioInvii =
    "(select count(*) from invii i where i.campagna_id = c.id) as destinatari";

  function fetchCampagne() {
    return db.prepare(`
      select c.id, c.titolo, c.stato, c.created_at, ${conteggioInvii}
      from campagne c order by c.created_at desc
    `).all();
  }

  function fetchCampagna(id) {
    const campagna = db.prepare("select * from campagne where id = ?").get(id);
    if (!campagna) throw new Error("Annuncio non trovato.");
    const invii = db.prepare(`
      select i.id, i.numero, i.esito, i.dettaglio, i.inviato_at, p.cognome, p.nome
      from invii i left join persone p on p.id = i.persona_id
      where i.campagna_id = ? order by i.numero
    `).all(id).map(({ cognome, nome, ...invio }) => ({
      ...invio,
      persone: cognome != null ? { cognome, nome } : null,
    }));
    return { campagna, invii };
  }

  const creaCampagna = db.transaction(({ titolo, testo, destinatari, stato = "bozza" }) => {
    const campagna = db.prepare(
      "insert into campagne (id, titolo, testo, stato) values (?, ?, ?, ?) returning *"
    ).get(randomUUID(), titolo, testo, stato);
    const ins = db.prepare(
      "insert into invii (id, campagna_id, persona_id, numero) values (?, ?, ?, ?)"
    );
    for (const d of destinatari ?? []) ins.run(randomUUID(), campagna.id, d.persona_id, d.numero);
    return campagna;
  });

  function cambiaStatoCampagna(id, stato) {
    db.prepare("update campagne set stato = ?, updated_at = ? where id = ?")
      .run(stato, adesso(), id);
  }

  function eliminaCampagna(id) {
    db.prepare("delete from campagne where id = ?").run(id);
  }

  // ---------- Invii (lato invio WhatsApp) ----------

  function fetchCampagnePronte() {
    return db.prepare(`
      select c.id, c.titolo, c.testo, c.stato, c.created_at, ${conteggioInvii}
      from campagne c where c.stato in ('pronta', 'in_invio')
      order by c.created_at desc
    `).all();
  }

  function fetchCodaInvii(campagnaId) {
    return db.prepare(
      "select id, numero from invii where campagna_id = ? and esito = 'in_coda'"
    ).all(campagnaId);
  }

  function aggiornaInvio(id, campi) {
    const [cols, vals] = ammessi(campi, CAMPI_INVIO);
    if (!cols.length) return;
    db.prepare(`update invii set ${cols.map((c) => `${c} = ?`).join(", ")} where id = ?`)
      .run(...vals, id);
  }

  return {
    db,
    chiudi: () => db.close(),
    getImpostazione, setImpostazione, getProfilo,
    fetchGruppi, fetchGruppo, aggiornaGruppo, eliminaGruppo,
    fetchPersone, fetchPersoneMinime, creaPersona, aggiornaPersona,
    aggiungiAlGruppo, rimuoviDalGruppo,
    importaGruppo,
    fetchListe, creaLista, fetchLista, aggiornaLista,
    aggiungiALista, rimuoviDaLista, eliminaLista,
    fetchTemplates, salvaTemplate, eliminaTemplate,
    fetchCampagne, fetchCampagna, creaCampagna, cambiaStatoCampagna, eliminaCampagna,
    fetchCampagnePronte, fetchCodaInvii, aggiornaInvio,
  };
}

module.exports = { creaDb };
