/**
 * Risoluzione dei destinatari di una campagna a partire dalle persone:
 * un solo invio per numero (fratelli/genitori condivisi), esclusi i senza numero.
 * Logica pura, testabile.
 */

export function buildDestinatari(persone) {
  const perNumero = new Map();
  const esclusi = [];
  for (const p of persone ?? []) {
    if (!p.cellulare) {
      esclusi.push(p);
      continue;
    }
    if (!perNumero.has(p.cellulare)) {
      perNumero.set(p.cellulare, { persona_id: p.id, numero: p.cellulare });
    }
  }
  return { destinatari: [...perNumero.values()], esclusi };
}

export const STATI_CAMPAGNA = {
  bozza: { label: "Bozza", tono: "neutro" },
  pronta: { label: "Pronta per l'invio", tono: "blu" },
  in_invio: { label: "Invio in corso", tono: "warn" },
  completata: { label: "Completata", tono: "ok" },
  annullata: { label: "Annullata", tono: "neutro" },
};

export const ESITI_INVIO = {
  in_coda: { label: "in coda", tono: "neutro" },
  inviato: { label: "inviato", tono: "ok" },
  non_whatsapp: { label: "non su WhatsApp", tono: "warn" },
  errore: { label: "errore", tono: "warn" },
};
