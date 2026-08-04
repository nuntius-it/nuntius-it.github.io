/**
 * Schema del database locale SQLite (migrazione locale-first, ex supabase/schema.sql).
 * Le migrazioni sono guidate da PRAGMA user_version: ogni voce di MIGRAZIONI
 * porta il database dalla versione (indice) alla versione (indice + 1).
 */

const MIGRAZIONI = [
  // 0 -> 1: schema iniziale (stesse tabelle di Supabase senza parrocchie/profili/RLS)
  `
  create table persone (
    id text primary key,
    cognome text not null,
    nome text not null,
    data_nascita text,
    cellulare text,           -- normalizzato E.164 (+39...), può essere null
    telefono_raw text,        -- valore originale dell'import, per diagnostica
    cellulare_raw text,
    email text,
    indirizzo text,
    comune text,
    note text,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  create table gruppi (
    id text primary key,
    nome text not null,           -- es. "Catechismo — 3a media"
    attivita text,                -- es. "Catechismo" (dal CSV UNIO)
    anno text,                    -- es. "2025/2026"
    archiviato integer not null default 0,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    unique (nome, anno)
  );

  create table appartenenze (
    persona_id text not null references persone (id) on delete cascade,
    gruppo_id text not null references gruppi (id) on delete cascade,
    tipo text not null default 'Partecipante',  -- Partecipante | Responsabile
    primary key (persona_id, gruppo_id)
  );

  create table liste (
    id text primary key,
    nome text not null,           -- es. "Festa di Carnevale 2027"
    descrizione text,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  create table liste_persone (
    lista_id text not null references liste (id) on delete cascade,
    persona_id text not null references persone (id) on delete cascade,
    primary key (lista_id, persona_id)
  );

  create table template (
    id text primary key,
    titolo text not null,
    testo text not null,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  create table campagne (
    id text primary key,
    titolo text not null,
    testo text not null,
    -- bozza -> pronta -> in_invio -> completata (o annullata)
    stato text not null default 'bozza'
      check (stato in ('bozza', 'pronta', 'in_invio', 'completata', 'annullata')),
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  create table invii (
    id text primary key,
    campagna_id text not null references campagne (id) on delete cascade,
    persona_id text references persone (id) on delete set null,
    numero text not null,         -- E.164, denormalizzato: resta anche se la persona è eliminata
    -- in_coda -> inviato | non_whatsapp | errore
    esito text not null default 'in_coda'
      check (esito in ('in_coda', 'inviato', 'non_whatsapp', 'errore')),
    dettaglio text,
    inviato_at text
  );

  create index invii_campagna_idx on invii (campagna_id);
  create index appartenenze_gruppo_idx on appartenenze (gruppo_id);

  -- chiavi: nome_parrocchia, diocesi, ultimo_backup, ...
  create table impostazioni (
    chiave text primary key,
    valore text
  );
  `,
];

const VERSIONE_SCHEMA = MIGRAZIONI.length;

/** Porta il database alla versione corrente dello schema (idempotente). */
function migra(db) {
  let versione = db.pragma("user_version", { simple: true });
  while (versione < VERSIONE_SCHEMA) {
    const applica = db.transaction(() => {
      db.exec(MIGRAZIONI[versione]);
      db.pragma(`user_version = ${versione + 1}`);
    });
    applica();
    versione += 1;
  }
  return versione;
}

module.exports = { migra, VERSIONE_SCHEMA };
