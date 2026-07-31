import {
  fetchGruppi, fetchGruppo, fetchListe, fetchLista,
  fetchTemplates, salvaTemplate, creaCampagna,
} from "../lib/db.js";
import { buildDestinatari } from "../lib/campagna.js";
import { waToHtml } from "../lib/waFormat.js";
import { esc, statCard, spinner } from "../ui/html.js";

/**
 * Composizione di un annuncio: scelta destinatari (gruppo o lista),
 * testo con anteprima WhatsApp, template, salvataggio come bozza o "pronta".
 */
export async function viewNuovaCampagna(container) {
  container.innerHTML = spinner();
  const [gruppi, liste, templates] = await Promise.all([
    fetchGruppi(), fetchListe(), fetchTemplates(),
  ]);

  const stato = { sorgente: null, persone: [], testo: "", titolo: "" };

  async function caricaSorgente(tipo, id) {
    if (tipo === "gruppo") {
      const { gruppo, persone } = await fetchGruppo(id);
      stato.sorgente = { tipo, id, nome: gruppo.nome };
      stato.persone = persone;
    } else {
      const { lista, persone } = await fetchLista(id);
      stato.sorgente = { tipo, id, nome: lista.nome };
      stato.persone = persone;
    }
  }

  function render() {
    const { destinatari, esclusi } = buildDestinatari(stato.persone);
    container.innerHTML = `
      <div class="page-head">
        <h2>Nuovo annuncio</h2>
        <a class="btn btn--ghost" href="#/campagne">← Annunci</a>
      </div>

      <section class="card-soft">
        <h3>1 · A chi?</h3>
        <div class="form-row">
          <label>Destinatari
            <select id="sorgente">
              <option value="">— scegli un gruppo o una lista —</option>
              <optgroup label="Liste">
                ${liste.map((l) => `<option value="lista:${l.id}"
                  ${stato.sorgente?.tipo === "lista" && stato.sorgente.id === l.id ? "selected" : ""}>
                  ${esc(l.nome)} (${l.persone})</option>`).join("")}
              </optgroup>
              <optgroup label="Gruppi">
                ${gruppi.map((g) => `<option value="gruppo:${g.id}"
                  ${stato.sorgente?.tipo === "gruppo" && stato.sorgente.id === g.id ? "selected" : ""}>
                  ${esc(g.nome)}${g.anno ? ` · ${esc(g.anno)}` : ""} (${g.partecipanti})</option>`).join("")}
              </optgroup>
            </select>
          </label>
        </div>
        ${stato.sorgente ? `
        <div class="stats-row">
          ${statCard(destinatari.length, "messaggi da inviare (numeri unici)", "blu")}
          ${statCard(esclusi.length, "persone senza cellulare", esclusi.length ? "warn" : "neutro")}
        </div>
        ${esclusi.length ? `<p class="hint">Senza cellulare: ${esclusi
          .map((p) => esc(`${p.cognome} ${p.nome}`)).join(", ")} — andranno avvisati a voce.</p>` : ""}` : ""}
      </section>

      <section class="card-soft">
        <h3>2 · Il messaggio</h3>
        ${templates.length ? `
        <label class="tpl-row">Riparti da un messaggio salvato
          <select id="template">
            <option value="">—</option>
            ${templates.map((t) => `<option value="${t.id}">${esc(t.titolo)}</option>`).join("")}
          </select>
        </label>` : ""}
        <div class="compose">
          <label>Testo (WhatsApp: *grassetto*, _corsivo_, ~barrato~)
            <textarea id="testo" rows="8"
              placeholder="Carissimi genitori, ...">${esc(stato.testo)}</textarea>
          </label>
          <div class="preview">
            <span class="preview-label">Anteprima</span>
            <div class="bubble" id="preview">${waToHtml(stato.testo) || "<span class='muted'>…</span>"}</div>
          </div>
        </div>
      </section>

      <section class="card-soft">
        <h3>3 · Salva</h3>
        <form id="salva-campagna">
          <div class="form-row">
            <label>Titolo (per ritrovarlo, non viene inviato)
              <input name="titolo" required value="${esc(stato.titolo)}"
                placeholder="es. Avviso ritiro 3ª media" />
            </label>
          </div>
          <label class="check-row">
            <input type="checkbox" id="salva-tpl" /> Salva anche come messaggio riutilizzabile
          </label>
          <div class="actions">
            <button type="submit" class="btn" data-stato="pronta"
              ${stato.sorgente && destinatari.length ? "" : "disabled"}>
              Pronto per l'invio (${destinatari.length})</button>
            <button type="submit" class="btn btn--ghost" data-stato="bozza"
              ${stato.sorgente ? "" : "disabled"}>Salva come bozza</button>
          </div>
          <p class="hint">Gli annunci "pronti" compaiono in <strong>Nuntius Sender</strong>
          sul computer della parrocchia, da cui parte l'invio vero e proprio.</p>
        </form>
      </section>`;

    container.querySelector("#sorgente").addEventListener("change", async (e) => {
      stato.testo = container.querySelector("#testo")?.value ?? stato.testo;
      const [tipo, id] = e.target.value.split(":");
      if (!id) return;
      container.querySelector("#sorgente").disabled = true;
      await caricaSorgente(tipo, id);
      render();
    });

    const testoEl = container.querySelector("#testo");
    testoEl.addEventListener("input", () => {
      stato.testo = testoEl.value;
      container.querySelector("#preview").innerHTML =
        waToHtml(stato.testo) || "<span class='muted'>…</span>";
    });

    container.querySelector("#template")?.addEventListener("change", (e) => {
      const t = templates.find((x) => x.id === e.target.value);
      if (!t) return;
      stato.testo = t.testo;
      stato.titolo = stato.titolo || t.titolo;
      render();
    });

    let statoScelto = "bozza";
    container.querySelectorAll("#salva-campagna button[data-stato]").forEach((b) =>
      b.addEventListener("click", () => (statoScelto = b.dataset.stato))
    );
    container.querySelector("#salva-campagna").addEventListener("submit", async (e) => {
      e.preventDefault();
      const titolo = new FormData(e.target).get("titolo").trim();
      stato.testo = container.querySelector("#testo").value;
      if (!titolo || !stato.testo.trim() || !stato.sorgente) return;
      const salvaTpl = container.querySelector("#salva-tpl").checked;
      container.innerHTML = spinner("Salvataggio…");
      const { destinatari: dest } = buildDestinatari(stato.persone);
      if (salvaTpl) await salvaTemplate(titolo, stato.testo);
      const campagna = await creaCampagna({
        titolo, testo: stato.testo, destinatari: dest, stato: statoScelto,
      });
      location.hash = `#/campagna/${campagna.id}`;
    });
  }

  render();
}
