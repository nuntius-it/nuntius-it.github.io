import { fetchLista, rimuoviDaLista, eliminaLista } from "../lib/db.js";
import { dedupePhones } from "../lib/phone.js";
import { formatItalianDate } from "../lib/dates.js";
import { esc, chip, statCard, spinner } from "../ui/html.js";

export async function viewLista(container, { id }) {
  container.innerHTML = spinner();
  const { lista, persone } = await fetchLista(id);
  const numeri = dedupePhones(persone.map((p) => p.cellulare));

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(lista.nome)}</h2>
        ${lista.descrizione ? `<p class="page-sub">${esc(lista.descrizione)}</p>` : ""}
      </div>
      <a class="btn btn--ghost" href="#/liste">← Liste</a>
    </div>
    <div class="stats-row">
      ${statCard(persone.length, "persone")}
      ${statCard(numeri.length, "numeri WhatsApp unici", "blu")}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nominativo</th><th>Nascita</th><th>Cellulare</th><th></th></tr></thead>
        <tbody>
          ${persone
            .map(
              (p) => `
            <tr>
              <td>${esc(p.cognome)} ${esc(p.nome)}</td>
              <td>${esc(formatItalianDate(p.data_nascita) || "—")}</td>
              <td>${p.cellulare ? esc(p.cellulare) : chip("senza cellulare", "warn")}</td>
              <td><button class="btn-link" data-rimuovi="${p.id}">rimuovi</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="actions">
      <a class="btn" href="#/nuova-campagna">Prepara un annuncio per questa lista →</a>
    </div>
    <details class="danger-zone">
      <summary>Elimina lista</summary>
      <p>Le persone restano in archivio: viene eliminata solo la lista.</p>
      <button class="btn btn--danger" id="del-lista">Elimina "${esc(lista.nome)}"</button>
    </details>`;

  container.querySelectorAll("[data-rimuovi]").forEach((b) =>
    b.addEventListener("click", async () => {
      await rimuoviDaLista(id, b.dataset.rimuovi);
      viewLista(container, { id });
    })
  );
  container.querySelector("#del-lista").addEventListener("click", async () => {
    await eliminaLista(id);
    location.hash = "#/liste";
  });
}
