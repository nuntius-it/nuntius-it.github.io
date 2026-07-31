import { fetchListe } from "../lib/db.js";
import { esc, emptyState, spinner } from "../ui/html.js";

export async function viewListe(container) {
  container.innerHTML = spinner();
  const liste = await fetchListe();

  if (!liste.length) {
    container.innerHTML = emptyState(
      "Nessuna lista ancora",
      `Le liste sono selezioni di persone per un'occasione: una festa, un ritiro,
       "dalla 5ª elementare in su". Le crei una volta e le ritrovi qui.`,
      `<a class="btn" href="#/nuova-lista">Crea la prima lista</a>`
    );
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <h2>Le tue liste</h2>
      <a class="btn" href="#/nuova-lista">Nuova lista</a>
    </div>
    <div class="grid">
      ${liste
        .map(
          (l) => `
        <a class="tile" href="#/lista/${l.id}">
          <h3>${esc(l.nome)}</h3>
          ${l.descrizione ? `<p class="tile-meta">${esc(l.descrizione)}</p>` : ""}
          <p class="tile-count">${l.persone} ${l.persone === 1 ? "persona" : "persone"}</p>
        </a>`
        )
        .join("")}
    </div>`;
}
