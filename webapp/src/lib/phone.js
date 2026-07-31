/**
 * Normalizzazione dei numeri di telefono italiani per l'invio WhatsApp.
 *
 * Formato canonico: E.164 senza spazi, es. "+393471234567".
 * Attenzione: i cellulari italiani possono iniziare per "39" (es. 393...),
 * quindi il prefisso internazionale va rimosso solo quando la lunghezza
 * complessiva lo rende inequivocabile (>= 11 cifre).
 */

/** Estrae le sole cifre, ricordando un eventuale "+" iniziale. */
function digitsOf(raw) {
  const s = String(raw ?? "").trim();
  return { digits: s.replace(/\D/g, ""), hadPlus: s.startsWith("+") };
}

/**
 * Normalizza un numero di cellulare italiano.
 * @returns {string|null} "+393xxxxxxxxx" oppure null se non è un cellulare valido.
 */
export function normalizeMobile(raw) {
  let { digits, hadPlus } = digitsOf(raw);
  if (!digits) return null;

  if (digits.startsWith("0039")) digits = digits.slice(4);
  else if (digits.startsWith("39") && (hadPlus || digits.length >= 11)) digits = digits.slice(2);

  // Cellulari italiani: iniziano per 3, 9 o 10 cifre totali.
  if (!/^3\d{8,9}$/.test(digits)) return null;
  return `+39${digits}`;
}

/** true se il numero è un cellulare italiano valido (in qualunque formato). */
export function isMobile(raw) {
  return normalizeMobile(raw) !== null;
}

/**
 * Sceglie il numero WhatsApp di una persona: preferisce `cellulare`,
 * ripiega su `telefono` solo se è a sua volta un cellulare.
 * @returns {string|null}
 */
export function pickMobile({ cellulare, telefono } = {}) {
  return normalizeMobile(cellulare) ?? normalizeMobile(telefono);
}

/**
 * Deduplica una lista di numeri già normalizzati (o normalizzabili),
 * scartando i non validi e preservando l'ordine di prima apparizione.
 * Caso tipico: fratelli nello stesso gruppo → il genitore riceve un solo messaggio.
 * @returns {string[]}
 */
export function dedupePhones(rawList) {
  const seen = new Set();
  const out = [];
  for (const raw of rawList ?? []) {
    const n = normalizeMobile(raw);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
