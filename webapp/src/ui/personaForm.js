/** Form di creazione/modifica di una persona, in una modale. */
import { apriModale } from "./modale.js";
import { esc } from "./html.js";
import { normalizeMobile } from "../lib/phone.js";
import { creaPersona, aggiornaPersona } from "../lib/db.js";

/**
 * @param {object|null} persona  persona esistente, o null per crearne una nuova
 * @param {object} opzioni
 *   - tipo: "Partecipante" | "Responsabile" | null — se non null mostra la scelta
 *     del ruolo (contesto gruppo)
 *   - onSalvata(persona, { tipo }): chiamata dopo il salvataggio
 */
export function apriFormPersona(persona, { tipo = null, onSalvata } = {}) {
  const p = persona ?? {};
  const { el, chiudi } = apriModale(
    persona ? "Modifica persona" : "Nuova persona",
    `
    <form id="form-persona">
      <div class="form-row">
        <label>Cognome<input name="cognome" required value="${esc(p.cognome ?? "")}"></label>
        <label>Nome<input name="nome" required value="${esc(p.nome ?? "")}"></label>
      </div>
      <div class="form-row">
        <label>Data di nascita
          <input type="date" name="data_nascita" value="${esc(String(p.data_nascita ?? "").slice(0, 10))}">
        </label>
        <label>Cellulare (per WhatsApp)
          <input name="cellulare" inputmode="tel" placeholder="es. 347 1234567" value="${esc(p.cellulare ?? "")}">
        </label>
      </div>
      <div class="form-row">
        <label>Email<input type="email" name="email" value="${esc(p.email ?? "")}"></label>
        ${
          tipo !== null
            ? `
        <label>Ruolo nel gruppo
          <select name="tipo">
            <option value="Partecipante" ${tipo !== "Responsabile" ? "selected" : ""}>Partecipante</option>
            <option value="Responsabile" ${tipo === "Responsabile" ? "selected" : ""}>Responsabile</option>
          </select>
        </label>`
            : ""
        }
      </div>
      <p class="error" id="err-persona" hidden></p>
      <div class="actions">
        <button type="submit" class="btn">Salva</button>
        <button type="button" class="btn btn--ghost" id="annulla-persona">Annulla</button>
      </div>
    </form>`
  );

  el.querySelector("#annulla-persona").addEventListener("click", chiudi);
  el.querySelector("#form-persona").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const err = el.querySelector("#err-persona");
    const rawCell = String(f.get("cellulare") ?? "").trim();
    const cellulare = rawCell ? normalizeMobile(rawCell) : null;
    if (rawCell && !cellulare) {
      err.textContent =
        "Il cellulare non sembra un numero italiano valido (es. 347 1234567, con o senza +39).";
      err.hidden = false;
      return;
    }
    const campi = {
      cognome: String(f.get("cognome")).trim(),
      nome: String(f.get("nome")).trim(),
      data_nascita: f.get("data_nascita") || null,
      cellulare,
      cellulare_raw: rawCell,
      email: String(f.get("email") ?? "").trim() || null,
    };
    try {
      let salvata;
      if (persona) {
        await aggiornaPersona(persona.id, campi);
        salvata = { ...persona, ...campi };
      } else {
        salvata = await creaPersona(campi);
      }
      chiudi();
      onSalvata?.(salvata, { tipo: f.get("tipo") ?? null });
    } catch (e2) {
      err.textContent = `Errore nel salvataggio: ${e2.message}`;
      err.hidden = false;
    }
  });
}
