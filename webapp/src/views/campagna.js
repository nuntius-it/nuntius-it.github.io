import { fetchCampagna, cambiaStatoCampagna, eliminaCampagna } from "../lib/db.js";
import { STATI_CAMPAGNA, ESITI_INVIO } from "../lib/campagna.js";
import { waToHtml } from "../lib/waFormat.js";
import { esc, chip, statCard, spinner } from "../ui/html.js";

export async function viewCampagna(container, { id }) {
  container.innerHTML = spinner();
  const { campagna, invii } = await fetchCampagna(id);
  const stato = STATI_CAMPAGNA[campagna.stato] ?? { label: campagna.stato, tono: "neutro" };
  const conta = (esito) => invii.filter((i) => i.esito === esito).length;

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(campagna.titolo)}</h2>
        <p class="page-sub">${new Date(campagna.created_at).toLocaleString("it-IT")}
          · ${chip(stato.label, stato.tono)}</p>
      </div>
      <a class="btn btn--ghost" href="#/campagne">← Annunci</a>
    </div>

    <div class="compose">
      <div class="preview preview--solo">
        <span class="preview-label">Messaggio</span>
        <div class="bubble">${waToHtml(campagna.testo)}</div>
      </div>
      <div>
        <div class="stats-row stats-row--col">
          ${statCard(invii.length, "destinatari")}
          ${statCard(conta("inviato"), "inviati", conta("inviato") ? "ok" : "neutro")}
          ${statCard(conta("in_coda"), "in coda")}
          ${conta("non_whatsapp") + conta("errore")
            ? statCard(conta("non_whatsapp") + conta("errore"), "non recapitati", "warn")
            : ""}
        </div>
        <div class="actions">
          ${campagna.stato === "bozza"
            ? `<button class="btn" id="pronta">Segna pronta per l'invio</button>`
            : ""}
          ${campagna.stato === "pronta"
            ? `<button class="btn btn--ghost" id="bozza">Riporta in bozza</button>`
            : ""}
        </div>
        ${campagna.stato === "pronta"
          ? `<p class="hint">Ora apri <strong>Nuntius Sender</strong> sul computer della
             parrocchia: troverai questo annuncio pronto da inviare.</p>`
          : ""}
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead><tr><th>Destinatario</th><th>Numero</th><th>Esito</th><th>Quando</th></tr></thead>
        <tbody>
          ${invii
            .map((i) => {
              const e = ESITI_INVIO[i.esito] ?? { label: i.esito, tono: "neutro" };
              return `
            <tr>
              <td>${i.persone ? esc(`${i.persone.cognome} ${i.persone.nome}`) : "—"}</td>
              <td>${esc(i.numero)}</td>
              <td>${chip(e.label, e.tono)}${i.dettaglio ? ` <small class="muted">${esc(i.dettaglio)}</small>` : ""}</td>
              <td>${i.inviato_at ? new Date(i.inviato_at).toLocaleString("it-IT") : ""}</td>
            </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>

    <details class="danger-zone">
      <summary>Elimina annuncio</summary>
      <p>Vengono eliminati anche gli esiti degli invii.</p>
      <button class="btn btn--danger" id="del">Elimina "${esc(campagna.titolo)}"</button>
    </details>`;

  container.querySelector("#pronta")?.addEventListener("click", async () => {
    await cambiaStatoCampagna(id, "pronta");
    viewCampagna(container, { id });
  });
  container.querySelector("#bozza")?.addEventListener("click", async () => {
    await cambiaStatoCampagna(id, "bozza");
    viewCampagna(container, { id });
  });
  container.querySelector("#del").addEventListener("click", async () => {
    await eliminaCampagna(id);
    location.hash = "#/campagne";
  });
}
