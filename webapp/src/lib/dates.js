/** Date italiane (gg/mm/aaaa) ↔ ISO (aaaa-mm-gg). */

export function parseItalianDate(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, g, mm, a] = m;
  const giorno = Number(g), mese = Number(mm);
  if (giorno < 1 || giorno > 31 || mese < 1 || mese > 12) return null;
  return `${a}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

export function formatItalianDate(iso) {
  const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Anno di nascita da data italiana o ISO. */
export function birthYear(s) {
  const iso = parseItalianDate(s) ?? (/^\d{4}-\d{2}-\d{2}/.test(String(s ?? "")) ? s : null);
  return iso ? Number(iso.slice(0, 4)) : null;
}
