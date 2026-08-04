/** Modale di ricerca di una persona già in archivio, con scorciatoia per crearne una nuova. */
import { apriModale } from "./modale.js";
import { esc } from "./html.js";
import { fetchPersoneMinime } from "../lib/db.js";
import { formatItalianDate } from "../lib/dates.js";

/**
 * @param {object} opzioni
 *   - escludi: Set di id da nascondere (già presenti nell'elenco di destinazione)
 *   - onScelta(personaId): persona scelta dall'archivio
 *   - onNuova(): l'utente vuole creare una persona nuova
 */
export async function apriCercaPersona({ escludi = new Set(), onScelta, onNuova } = {}) {
  const persone = (await fetchPersoneMinime())
    .filter((p) => !escludi.has(p.id))
    .sort(
      (a, b) =>
        a.cognome.localeCompare(b.cognome, "it") || a.nome.localeCompare(b.nome, "it")
    );

  const { el, chiudi } = apriModale(
    "Aggiungi una persona",
    `
    <label>Cerca in archivio
      <input id="cerca-persona" placeholder="Cognome o nome…" autocomplete="off">
    </label>
    <div id="cerca-risultati" class="cerca-risultati"></div>
    <div class="actions">
      <button type="button" class="btn btn--ghost" id="cerca-nuova">Non è in archivio? Creala nuova</button>
    </div>`
  );

  const risultati = el.querySelector("#cerca-risultati");
  const input = el.querySelector("#cerca-persona");

  const rendi = () => {
    const q = input.value.trim().toLowerCase();
    const match = persone
      .filter((p) => `${p.cognome} ${p.nome}`.toLowerCase().includes(q))
      .slice(0, 30);
    risultati.innerHTML =
      match
        .map(
          (p) => `
      <button type="button" class="cerca-voce" data-id="${p.id}">
        <span>${esc(p.cognome)} ${esc(p.nome)}</span>
        <span class="muted">${esc(formatItalianDate(p.data_nascita) || "")}</span>
      </button>`
        )
        .join("") ||
      `<p class="hint">Nessuna persona trovata in archivio con questo nome.</p>`;
    risultati.querySelectorAll("[data-id]").forEach((b) =>
      b.addEventListener("click", () => {
        chiudi();
        onScelta?.(b.dataset.id);
      })
    );
  };

  input.addEventListener("input", rendi);
  el.querySelector("#cerca-nuova").addEventListener("click", () => {
    chiudi();
    onNuova?.();
  });
  rendi();
}
