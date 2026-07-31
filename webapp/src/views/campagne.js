import { fetchCampagne } from "../lib/db.js";
import { STATI_CAMPAGNA } from "../lib/campagna.js";
import { esc, chip, emptyState, spinner } from "../ui/html.js";

export async function viewCampagne(container) {
  container.innerHTML = spinner();
  const campagne = await fetchCampagne();

  if (!campagne.length) {
    container.innerHTML = emptyState(
      "Nessun annuncio ancora",
      `Un annuncio è un messaggio WhatsApp da inviare a un gruppo o a una lista.
       Si prepara da qui, si invia dal computer della parrocchia con Nuntius Sender.`,
      `<a class="btn" href="#/nuova-campagna">Prepara un annuncio</a>`
    );
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <h2>I tuoi annunci</h2>
      <a class="btn" href="#/nuova-campagna">Nuovo annuncio</a>
    </div>
    <div class="elenco">
      ${campagne
        .map((c) => {
          const stato = STATI_CAMPAGNA[c.stato] ?? { label: c.stato, tono: "neutro" };
          return `
        <a class="riga" href="#/campagna/${c.id}">
          <div>
            <strong>${esc(c.titolo)}</strong>
            <span class="riga-meta">${new Date(c.created_at).toLocaleDateString("it-IT")}
              · ${c.destinatari} destinatari</span>
          </div>
          ${chip(stato.label, stato.tono)}
        </a>`;
        })
        .join("")}
    </div>`;
}
