import { fetchGruppo, eliminaGruppo } from "../lib/db.js";
import { dedupePhones } from "../lib/phone.js";
import { formatItalianDate } from "../lib/dates.js";
import { esc, chip, statCard, spinner } from "../ui/html.js";

export async function viewGruppo(container, { id }) {
  container.innerHTML = spinner();
  const { gruppo, persone } = await fetchGruppo(id);
  const numeri = dedupePhones(persone.map((p) => p.cellulare));
  const senzaNumero = persone.filter((p) => !p.cellulare);

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(gruppo.nome)}</h2>
        <p class="page-sub">${esc(gruppo.anno ?? "")}</p>
      </div>
      <a class="btn btn--ghost" href="#/">← Tutti i gruppi</a>
    </div>
    <div class="stats-row">
      ${statCard(persone.length, "persone")}
      ${statCard(numeri.length, "numeri WhatsApp unici", "blu")}
      ${statCard(senzaNumero.length, "senza cellulare", senzaNumero.length ? "warn" : "neutro")}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nominativo</th><th>Nascita</th><th>Cellulare</th><th>Email</th></tr></thead>
        <tbody>
          ${persone
            .map(
              (p) => `
            <tr>
              <td>${esc(p.cognome)} ${esc(p.nome)}
                ${p.tipo === "Responsabile" ? chip("Responsabile", "blu") : ""}</td>
              <td>${esc(formatItalianDate(p.data_nascita) || "—")}</td>
              <td>${p.cellulare ? esc(p.cellulare) : chip("senza cellulare", "warn")}</td>
              <td>${esc(p.email ?? "")}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <p class="hint">Per aggiornare il gruppo, riesporta l'elenco da UNIO e
      <a href="#/importa">importalo di nuovo</a>: le persone già presenti vengono
      aggiornate, non duplicate.</p>
    <details class="danger-zone">
      <summary>Elimina gruppo</summary>
      <p>Il gruppo e le appartenenze vengono rimossi; le persone restano in archivio.</p>
      <button class="btn btn--danger" id="del-gruppo">Elimina definitivamente "${esc(gruppo.nome)}"</button>
    </details>`;

  container.querySelector("#del-gruppo").addEventListener("click", async () => {
    await eliminaGruppo(id);
    location.hash = "#/";
  });
}
