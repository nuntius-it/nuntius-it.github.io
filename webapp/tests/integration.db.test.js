/**
 * Test di integrazione contro il progetto Supabase reale.
 * Usa SOLO dati sintetici (cognome "Zztest…") e pulisce tutto alla fine.
 * Si attiva solo se le variabili d'ambiente sono presenti:
 *   NUNTIUS_IT_URL, NUNTIUS_IT_ANON, NUNTIUS_IT_EMAIL, NUNTIUS_IT_PASSWORD
 * (in CI restano assenti → il test viene saltato).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const attivo =
  env.NUNTIUS_IT_URL && env.NUNTIUS_IT_ANON && env.NUNTIUS_IT_EMAIL && env.NUNTIUS_IT_PASSWORD;

describe.skipIf(!attivo)("integrazione Supabase (dati sintetici)", () => {
  let sb, parrocchiaId, gruppoId;
  const MARK = "Zztest-integrazione";

  beforeAll(async () => {
    sb = createClient(env.NUNTIUS_IT_URL, env.NUNTIUS_IT_ANON);
    const { error } = await sb.auth.signInWithPassword({
      email: env.NUNTIUS_IT_EMAIL,
      password: env.NUNTIUS_IT_PASSWORD,
    });
    expect(error).toBeNull();
    const { data: sess } = await sb.auth.getSession();
    const { data: profilo } = await sb
      .from("profili")
      .select("parrocchia_id")
      .eq("user_id", sess.session.user.id)
      .single();
    parrocchiaId = profilo.parrocchia_id;
  });

  afterAll(async () => {
    // Pulizia: rimuove gruppo e persone sintetiche (cascata su appartenenze).
    if (gruppoId) await sb.from("gruppi").delete().eq("id", gruppoId);
    await sb.from("persone").delete().eq("cognome", MARK);
    await sb.auth.signOut();
  });

  it("import: gruppo + persone + appartenenze, con RLS attiva", async () => {
    const { data: gruppo, error: eG } = await sb
      .from("gruppi")
      .upsert(
        { parrocchia_id: parrocchiaId, nome: `${MARK} gruppo`, anno: "2025/2026" },
        { onConflict: "parrocchia_id,nome,anno" }
      )
      .select()
      .single();
    expect(eG).toBeNull();
    gruppoId = gruppo.id;

    const { data: persone, error: eP } = await sb
      .from("persone")
      .insert([
        { parrocchia_id: parrocchiaId, cognome: MARK, nome: "Uno", cellulare: "+393000000001" },
        { parrocchia_id: parrocchiaId, cognome: MARK, nome: "Due", cellulare: "+393000000001" },
      ])
      .select("id");
    expect(eP).toBeNull();

    const { error: eA } = await sb.from("appartenenze").upsert(
      persone.map((p) => ({
        persona_id: p.id,
        gruppo_id: gruppoId,
        parrocchia_id: parrocchiaId,
        tipo: "Partecipante",
      })),
      { onConflict: "persona_id,gruppo_id" }
    );
    expect(eA).toBeNull();

    const { data: membri } = await sb
      .from("appartenenze")
      .select("persone(cognome)")
      .eq("gruppo_id", gruppoId);
    expect(membri).toHaveLength(2);
  });

  it("upsert ripetuto del gruppo non duplica (re-import)", async () => {
    const { data: di_nuovo } = await sb
      .from("gruppi")
      .upsert(
        { parrocchia_id: parrocchiaId, nome: `${MARK} gruppo`, anno: "2025/2026" },
        { onConflict: "parrocchia_id,nome,anno" }
      )
      .select()
      .single();
    expect(di_nuovo.id).toBe(gruppoId);
  });

  it("liste: creazione, conteggio, eliminazione", async () => {
    const { data: persone } = await sb.from("persone").select("id").eq("cognome", MARK);
    const { data: lista, error } = await sb
      .from("liste")
      .insert({ parrocchia_id: parrocchiaId, nome: `${MARK} lista` })
      .select()
      .single();
    expect(error).toBeNull();
    await sb.from("liste_persone").insert(
      persone.map((p) => ({
        lista_id: lista.id,
        persona_id: p.id,
        parrocchia_id: parrocchiaId,
      }))
    );
    const { data: conteggio } = await sb
      .from("liste")
      .select("liste_persone(count)")
      .eq("id", lista.id)
      .single();
    expect(conteggio.liste_persone[0].count).toBe(2);
    await sb.from("liste").delete().eq("id", lista.id);
  });
});
