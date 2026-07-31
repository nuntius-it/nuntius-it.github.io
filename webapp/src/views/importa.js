import { parseUnioCsv } from "../lib/unioCsv.js";
import { buildImportPlan } from "../lib/importPlan.js";
import { fetchPersoneMinime, importaGruppo } from "../lib/db.js";
import { formatItalianDate } from "../lib/dates.js";
import { esc, chip, statCard, spinner } from "../ui/html.js";

export async function viewImporta(container) {
  renderDropzone(container);
}

function renderDropzone(container) {
  container.innerHTML = `
    <div class="page-head"><h2>Importa un elenco da UNIO</h2></div>
    <div class="import-guide card-soft">
      <h3>Come esportare l'elenco da UNIO</h3>
      <ol>
        <li>Entra in UNIO → <strong>Servizi</strong> → <strong>Anagrafiche</strong> → <strong>Attività</strong></li>
        <li>Apri il gruppo che ti interessa (puoi filtrare per anno con l'imbuto)</li>
        <li>Clicca l'icona <strong>stampante</strong> → <strong>Esportazione informazioni gruppo (CSV)</strong></li>
        <li>Trascina qui sotto il file scaricato</li>
      </ol>
    </div>
    <label class="dropzone" id="dropzone">
      <input type="file" id="file-input" accept=".csv,text/csv" hidden />
      <span class="dropzone-icon">⤓</span>
      <strong>Trascina qui il file CSV</strong>
      <span>oppure clicca per sceglierlo</span>
    </label>
    <p class="error" id="import-error" hidden></p>`;

  const dropzone = container.querySelector("#dropzone");
  const input = container.querySelector("#file-input");
  const showError = (msg) => {
    const el = container.querySelector("#import-error");
    el.textContent = msg;
    el.hidden = false;
  };

  const handleFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const { persone, errori } = parseUnioCsv(text);
    if (!persone.length) {
      showError(errori[0] ?? "File non riconosciuto.");
      return;
    }
    container.innerHTML = spinner("Confronto con l'archivio…");
    const esistenti = await fetchPersoneMinime();
    const plan = buildImportPlan(persone, esistenti);
    renderAnteprima(container, plan, errori);
  };

  input.addEventListener("change", () => handleFile(input.files[0]));
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dropzone--over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dropzone--over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dropzone--over");
    handleFile(e.dataTransfer.files[0]);
  });
}

function renderAnteprima(container, plan, erroriParse) {
  const { voci, stats, suggerimenti } = plan;
  container.innerHTML = `
    <div class="page-head"><h2>Anteprima import</h2></div>
    <form id="conferma-form" class="card-soft">
      <div class="form-row">
        <label>Nome del gruppo
          <input name="nome" required value="${esc(suggerimenti.nome)}" />
        </label>
        <label>Anno
          <input name="anno" value="${esc(suggerimenti.anno)}" placeholder="es. 2025/2026" />
        </label>
      </div>
      <div class="stats-row">
        ${statCard(stats.totale, "persone nel file")}
        ${statCard(stats.nuove, "nuove", stats.nuove ? "ok" : "neutro")}
        ${statCard(stats.esistenti, "già in archivio")}
        ${statCard(stats.numeriUnici, "numeri WhatsApp unici", "blu")}
        ${statCard(stats.senzaNumero, "senza cellulare", stats.senzaNumero ? "warn" : "neutro")}
      </div>
      ${erroriParse.length ? `<p class="error">${erroriParse.map(esc).join("<br>")}</p>` : ""}
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nominativo</th><th>Nascita</th><th>Cellulare</th><th></th></tr></thead>
          <tbody>
            ${voci
              .map(
                (v) => `
              <tr>
                <td>${esc(v.riga.cognome)} ${esc(v.riga.nome)}
                  ${v.tipo === "Responsabile" ? chip("Responsabile", "blu") : ""}</td>
                <td>${esc(formatItalianDate(v.dataNascitaIso) || v.riga.dataNascita || "—")}</td>
                <td>${v.numero ? esc(v.numero) : chip("senza cellulare", "warn")}</td>
                <td>${v.esistenteId ? chip("già presente") : chip("nuova", "ok")}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="actions">
        <button type="submit" class="btn">Conferma import</button>
        <a class="btn btn--ghost" href="#/importa" data-reload>Annulla</a>
      </div>
    </form>`;

  container.querySelector("[data-reload]").addEventListener("click", (e) => {
    e.preventDefault();
    renderDropzone(container);
  });

  container.querySelector("#conferma-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const nome = form.get("nome").trim();
    if (!nome) return;
    container.innerHTML = spinner("Import in corso…");
    try {
      const esito = await importaGruppo({
        nome,
        anno: form.get("anno").trim() || null,
        attivita: voci[0]?.riga.gruppo ?? null,
        voci,
      });
      container.innerHTML = `
        <div class="card-soft success">
          <h2>Import completato ✓</h2>
          <p>Gruppo <strong>${esc(nome)}</strong>: ${esito.inserite} persone nuove,
          ${esito.aggiornate} aggiornate.</p>
          <div class="actions">
            <a class="btn" href="#/gruppo/${esito.gruppoId}">Apri il gruppo</a>
            <a class="btn btn--ghost" href="#/importa" data-again>Importa un altro elenco</a>
          </div>
        </div>`;
      container.querySelector("[data-again]")?.addEventListener("click", (e2) => {
        e2.preventDefault();
        renderDropzone(container);
      });
    } catch (err) {
      container.innerHTML = `<p class="error">Errore durante l'import: ${esc(err.message)}</p>
        <a class="btn btn--ghost" href="#/importa">Riprova</a>`;
    }
  });
}
