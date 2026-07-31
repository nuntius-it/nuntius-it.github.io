import { fetchGruppi } from "../lib/db.js";
import { esc, emptyState, spinner } from "../ui/html.js";

export async function viewGruppi(container) {
  container.innerHTML = spinner();
  const gruppi = await fetchGruppi();

  if (!gruppi.length) {
    container.innerHTML = emptyState(
      "Nessun gruppo ancora",
      `Per cominciare, esporta un elenco da UNIO e importalo qui.<br>
       <small>In UNIO: <em>Servizi → Anagrafiche → Attività → apri il gruppo →
       icona stampante → Esportazione informazioni gruppo (CSV)</em></small>`,
      `<a class="btn" href="#/importa">Importa il primo elenco</a>`
    );
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <h2>I tuoi gruppi</h2>
      <a class="btn" href="#/importa">Importa elenco</a>
    </div>
    <div class="grid">
      ${gruppi
        .map(
          (g) => `
        <a class="tile" href="#/gruppo/${g.id}">
          <h3>${esc(g.nome)}</h3>
          <p class="tile-meta">${esc(g.anno ?? "")}</p>
          <p class="tile-count">${g.partecipanti} ${g.partecipanti === 1 ? "persona" : "persone"}</p>
        </a>`
        )
        .join("")}
    </div>`;
}
