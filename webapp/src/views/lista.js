import {
  fetchLista,
  rimuoviDaLista,
  eliminaLista,
  aggiornaLista,
  aggiungiALista,
} from "../lib/db.js";
import { dedupePhones } from "../lib/phone.js";
import { formatItalianDate } from "../lib/dates.js";
import { esc, chip, statCard, spinner } from "../ui/html.js";
import { apriModale } from "../ui/modale.js";
import { apriFormPersona } from "../ui/personaForm.js";
import { apriCercaPersona } from "../ui/cercaPersona.js";

export async function viewLista(container, { id }) {
  container.innerHTML = spinner();
  const { lista, persone } = await fetchLista(id);
  const numeri = dedupePhones(persone.map((p) => p.cellulare));
  const ricarica = () => viewLista(container, { id });

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(lista.nome)}</h2>
        <p class="page-sub">${lista.descrizione ? esc(lista.descrizione) + " " : ""}
          <button class="btn-link" id="rinomina-lista">✎ modifica nome</button></p>
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
              (p, i) => `
            <tr>
              <td>${esc(p.cognome)} ${esc(p.nome)}</td>
              <td>${esc(formatItalianDate(p.data_nascita) || "—")}</td>
              <td>${p.cellulare ? esc(p.cellulare) : chip("senza cellulare", "warn")}</td>
              <td class="cella-azioni">
                <button class="btn-link" data-modifica="${i}">modifica</button>
                <button class="btn-link" data-rimuovi="${p.id}">rimuovi</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="actions">
      <button class="btn btn--ghost" id="aggiungi-persona">+ Aggiungi una persona</button>
      <a class="btn" href="#/nuova-campagna">Prepara un annuncio per questa lista →</a>
    </div>
    <details class="danger-zone">
      <summary>Elimina lista</summary>
      <p>Le persone restano in archivio: viene eliminata solo la lista.</p>
      <button class="btn btn--danger" id="del-lista">Elimina "${esc(lista.nome)}"</button>
    </details>`;

  container.querySelector("#rinomina-lista").addEventListener("click", () => {
    const { el, chiudi } = apriModale(
      "Modifica lista",
      `
      <form id="form-lista">
        <div class="form-row">
          <label>Nome della lista<input name="nome" required value="${esc(lista.nome)}"></label>
          <label>Descrizione (facoltativa)<input name="descrizione" value="${esc(lista.descrizione ?? "")}"></label>
        </div>
        <p class="error" id="err-lista" hidden></p>
        <div class="actions"><button type="submit" class="btn">Salva</button></div>
      </form>`
    );
    el.querySelector("#form-lista").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await aggiornaLista(id, {
          nome: String(f.get("nome")).trim(),
          descrizione: String(f.get("descrizione")).trim() || null,
        });
        chiudi();
        ricarica();
      } catch (err) {
        const box = el.querySelector("#err-lista");
        box.textContent = `Errore nel salvataggio: ${err.message}`;
        box.hidden = false;
      }
    });
  });

  container.querySelectorAll("[data-modifica]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = persone[Number(b.dataset.modifica)];
      apriFormPersona(p, { onSalvata: ricarica });
    })
  );

  container.querySelectorAll("[data-rimuovi]").forEach((b) =>
    b.addEventListener("click", async () => {
      await rimuoviDaLista(id, b.dataset.rimuovi);
      ricarica();
    })
  );

  container.querySelector("#aggiungi-persona").addEventListener("click", () => {
    apriCercaPersona({
      escludi: new Set(persone.map((p) => p.id)),
      onScelta: async (personaId) => {
        await aggiungiALista(id, [personaId]);
        ricarica();
      },
      onNuova: () =>
        apriFormPersona(null, {
          onSalvata: async (nuova) => {
            await aggiungiALista(id, [nuova.id]);
            ricarica();
          },
        }),
    });
  });

  container.querySelector("#del-lista").addEventListener("click", async () => {
    await eliminaLista(id);
    location.hash = "#/liste";
  });
}
