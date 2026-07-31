/** Piccoli helper per generare HTML sicuro. */

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

export function chip(testo, tono = "neutro") {
  return `<span class="chip chip--${tono}">${esc(testo)}</span>`;
}

export function statCard(valore, etichetta, tono = "neutro") {
  return `
    <div class="stat stat--${tono}">
      <strong>${esc(valore)}</strong>
      <span>${esc(etichetta)}</span>
    </div>`;
}

export function emptyState(titolo, testo, azioneHtml = "") {
  return `
    <div class="empty">
      <h3>${esc(titolo)}</h3>
      <p>${testo}</p>
      ${azioneHtml}
    </div>`;
}

export function spinner(testo = "Caricamento…") {
  return `<div class="loading"><span class="dot"></span>${esc(testo)}</div>`;
}
