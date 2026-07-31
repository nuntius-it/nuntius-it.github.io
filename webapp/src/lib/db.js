/** Accesso dati Supabase. Tutte le query sono filtrate dalla RLS per parrocchia. */
import { supabase } from "./supabase.js";
import { vocePersonaFields } from "./importPlan.js";

let profiloCache = null;

export async function getProfilo() {
  if (profiloCache) return profiloCache;
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const { data, error } = await supabase
    .from("profili")
    .select("parrocchia_id, parrocchie(nome)")
    .eq("user_id", sess.session.user.id)
    .maybeSingle();
  if (error) throw error;
  profiloCache = {
    parrocchiaId: data?.parrocchia_id,
    nomeParrocchia: data?.parrocchie?.nome ?? sess.session.user.email,
  };
  return profiloCache;
}

export function resetProfilo() {
  profiloCache = null;
}

// ---------- Gruppi ----------

export async function fetchGruppi() {
  const { data, error } = await supabase
    .from("gruppi")
    .select("id, nome, attivita, anno, archiviato, appartenenze(count)")
    .eq("archiviato", false)
    .order("anno", { ascending: false })
    .order("nome");
  if (error) throw error;
  return data.map((g) => ({ ...g, partecipanti: g.appartenenze?.[0]?.count ?? 0 }));
}

export async function fetchGruppo(id) {
  const [{ data: gruppo, error: e1 }, { data: membri, error: e2 }] = await Promise.all([
    supabase.from("gruppi").select("*").eq("id", id).single(),
    supabase
      .from("appartenenze")
      .select("tipo, persone(*)")
      .eq("gruppo_id", id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const persone = membri
    .map((m) => ({ ...m.persone, tipo: m.tipo }))
    .sort((a, b) =>
      (a.tipo === "Responsabile" ? 0 : 1) - (b.tipo === "Responsabile" ? 0 : 1) ||
      a.cognome.localeCompare(b.cognome, "it")
    );
  return { gruppo, persone };
}

export async function eliminaGruppo(id) {
  const { error } = await supabase.from("gruppi").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Persone ----------

export async function fetchPersone() {
  const { data, error } = await supabase
    .from("persone")
    .select("*, appartenenze(gruppo_id, tipo)")
    .order("cognome")
    .order("nome");
  if (error) throw error;
  return data;
}

export async function fetchPersoneMinime() {
  const { data, error } = await supabase
    .from("persone")
    .select("id, cognome, nome, data_nascita");
  if (error) throw error;
  return data;
}

// ---------- Import ----------

/**
 * Esegue il piano di import: upsert del gruppo, insert delle persone nuove,
 * update dei contatti delle esistenti, upsert delle appartenenze.
 */
export async function importaGruppo({ nome, anno, attivita, voci }) {
  const { parrocchiaId } = await getProfilo();

  const { data: gruppo, error: eG } = await supabase
    .from("gruppi")
    .upsert(
      { parrocchia_id: parrocchiaId, nome, anno, attivita },
      { onConflict: "parrocchia_id,nome,anno" }
    )
    .select()
    .single();
  if (eG) throw eG;

  const nuove = voci.filter((v) => !v.esistenteId);
  const esistenti = voci.filter((v) => v.esistenteId);

  let inserite = [];
  if (nuove.length) {
    const { data, error } = await supabase
      .from("persone")
      .insert(nuove.map((v) => ({ ...vocePersonaFields(v), parrocchia_id: parrocchiaId })))
      .select("id");
    if (error) throw error;
    inserite = data;
  }

  for (const v of esistenti) {
    const { error } = await supabase
      .from("persone")
      .update({ ...vocePersonaFields(v), updated_at: new Date().toISOString() })
      .eq("id", v.esistenteId);
    if (error) throw error;
  }

  const appartenenze = [
    ...nuove.map((v, i) => ({ persona_id: inserite[i].id, tipo: v.tipo })),
    ...esistenti.map((v) => ({ persona_id: v.esistenteId, tipo: v.tipo })),
  ].map((a) => ({ ...a, gruppo_id: gruppo.id, parrocchia_id: parrocchiaId }));

  const { error: eA } = await supabase
    .from("appartenenze")
    .upsert(appartenenze, { onConflict: "persona_id,gruppo_id" });
  if (eA) throw eA;

  return { gruppoId: gruppo.id, inserite: nuove.length, aggiornate: esistenti.length };
}

// ---------- Liste ----------

export async function fetchListe() {
  const { data, error } = await supabase
    .from("liste")
    .select("id, nome, descrizione, created_at, liste_persone(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((l) => ({ ...l, persone: l.liste_persone?.[0]?.count ?? 0 }));
}

export async function creaLista(nome, descrizione, personaIds) {
  const { parrocchiaId } = await getProfilo();
  const { data: lista, error } = await supabase
    .from("liste")
    .insert({ parrocchia_id: parrocchiaId, nome, descrizione })
    .select()
    .single();
  if (error) throw error;
  if (personaIds.length) {
    const { error: e2 } = await supabase.from("liste_persone").insert(
      personaIds.map((pid) => ({
        lista_id: lista.id,
        persona_id: pid,
        parrocchia_id: parrocchiaId,
      }))
    );
    if (e2) throw e2;
  }
  return lista;
}

export async function fetchLista(id) {
  const [{ data: lista, error: e1 }, { data: righe, error: e2 }] = await Promise.all([
    supabase.from("liste").select("*").eq("id", id).single(),
    supabase.from("liste_persone").select("persone(*)").eq("lista_id", id),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const persone = righe
    .map((r) => r.persone)
    .sort((a, b) => a.cognome.localeCompare(b.cognome, "it"));
  return { lista, persone };
}

export async function rimuoviDaLista(listaId, personaId) {
  const { error } = await supabase
    .from("liste_persone")
    .delete()
    .eq("lista_id", listaId)
    .eq("persona_id", personaId);
  if (error) throw error;
}

export async function eliminaLista(id) {
  const { error } = await supabase.from("liste").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Template ----------

export async function fetchTemplates() {
  const { data, error } = await supabase
    .from("template")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function salvaTemplate(titolo, testo) {
  const { parrocchiaId } = await getProfilo();
  const { error } = await supabase
    .from("template")
    .insert({ parrocchia_id: parrocchiaId, titolo, testo });
  if (error) throw error;
}

export async function eliminaTemplate(id) {
  const { error } = await supabase.from("template").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Campagne ----------

export async function fetchCampagne() {
  const { data, error } = await supabase
    .from("campagne")
    .select("id, titolo, stato, created_at, invii(count)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((c) => ({ ...c, destinatari: c.invii?.[0]?.count ?? 0 }));
}

export async function fetchCampagna(id) {
  const [{ data: campagna, error: e1 }, { data: invii, error: e2 }] = await Promise.all([
    supabase.from("campagne").select("*").eq("id", id).single(),
    supabase
      .from("invii")
      .select("id, numero, esito, dettaglio, inviato_at, persone(cognome, nome)")
      .eq("campagna_id", id)
      .order("numero"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { campagna, invii };
}

export async function creaCampagna({ titolo, testo, destinatari, stato = "bozza" }) {
  const { parrocchiaId } = await getProfilo();
  const { data: campagna, error } = await supabase
    .from("campagne")
    .insert({ parrocchia_id: parrocchiaId, titolo, testo, stato })
    .select()
    .single();
  if (error) throw error;
  if (destinatari.length) {
    const { error: e2 } = await supabase.from("invii").insert(
      destinatari.map((d) => ({
        campagna_id: campagna.id,
        parrocchia_id: parrocchiaId,
        persona_id: d.persona_id,
        numero: d.numero,
      }))
    );
    if (e2) throw e2;
  }
  return campagna;
}

export async function cambiaStatoCampagna(id, stato) {
  const { error } = await supabase
    .from("campagne")
    .update({ stato, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function eliminaCampagna(id) {
  const { error } = await supabase.from("campagne").delete().eq("id", id);
  if (error) throw error;
}
