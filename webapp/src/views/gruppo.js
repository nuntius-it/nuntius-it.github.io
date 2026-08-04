import {
  fetchGruppo,
  eliminaGruppo,
  aggiornaGruppo,
  aggiungiAlGruppo,
  rimuoviDalGruppo,
} from "../lib/db.js";
import { dedupePhones } from "../lib/phone.js";
import { formatItalianDate } from "../lib/dates.js";
import { esc, chip, statCard, spinner } from "../ui/html.js";
import { apriModale } from "../ui/modale.js";
import { apriFormPersona } from "../ui/personaForm.js";
import { apriCercaPersona } from "../ui/cercaPersona.js";

export async function viewGruppo(container, { id }) {
  container.innerHTML = spinner();
  const { gruppo, persone } = await fetchGruppo(id);
  const numeri = dedupePhones(persone.map((p) => p.cellulare));
  const senzaNumero = persone.filter((p) => !p.cellulare);
  const ricarica = () => viewGruppo(container, { id });

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(gruppo.nome)}</h2>
        <p class="page-sub">${esc(gruppo.anno ?? "")}
          <button class="btn-link" id="rinomina-gruppo">✎ modifica nome</button></p>
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
        <thead><tr><th>Nominativo</th><th>Nascita</th><th>Cellulare</th><th>Email</th><th></th></tr></thead>
        <tbody>
          ${persone
            .map(
              (p, i) => `
            <tr>
              <td>${esc(p.cognome)} ${esc(p.nome)}
                ${p.tipo === "Responsabile" ? chip("Responsabile", "blu") : ""}</td>
              <td>${esc(formatItalianDate(p.data_nascita) || "—")}</td>
              <td>${p.cellulare ? esc(p.cellulare) : chip("senza cellulare", "warn")}</td>
              <td>${esc(p.email ?? "")}</td>
              <td class="cella-azioni">
                <button class="btn-link" data-modifica="${i}">modifica</button>
                <button class="btn-link" data-togli="${i}">togli</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="actions">
      <button class="btn btn--ghost" id="aggiungi-persona">+ Aggiungi una persona</button>
      <a class="btn" href="#/nuova-campagna">Prepara un annuncio per questo gruppo →</a>
    </div>
    <p class="hint">Con «modifica» correggi al volo un numero o un dato. Per aggiornare
      tutto il gruppo da UNIO, riesporta l'elenco e <a href="#/importa">importalo di
      nuovo</a>: le persone già presenti vengono aggiornate, non duplicate.</p>
    <details class="danger-zone">
      <summary>Elimina gruppo</summary>
      <p>Il gruppo e le appartenenze vengono rimossi; le persone restano in archivio.</p>
      <button class="btn btn--danger" id="del-gruppo">Elimina definitivamente "${esc(gruppo.nome)}"</button>
    </details>`;

  container.querySelector("#rinomina-gruppo").addEventListener("click", () => {
    const { el, chiudi } = apriModale(
      "Modifica gruppo",
      `
      <form id="form-gruppo">
        <div class="form-row">
          <label>Nome del gruppo<input name="nome" required value="${esc(gruppo.nome)}"></label>
          <label>Anno catechistico<input name="anno" placeholder="es. 2025/2026" value="${esc(gruppo.anno ?? "")}"></label>
        </div>
        <p class="error" id="err-gruppo" hidden></p>
        <div class="actions"><button type="submit" class="btn">Salva</button></div>
      </form>`
    );
    el.querySelector("#form-gruppo").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await aggiornaGruppo(id, {
          nome: String(f.get("nome")).trim(),
          anno: String(f.get("anno")).trim() || null,
        });
        chiudi();
        ricarica();
      } catch (err) {
        const box = el.querySelector("#err-gruppo");
        box.textContent = `Errore nel salvataggio: ${err.message}`;
        box.hidden = false;
      }
    });
  });

  container.querySelectorAll("[data-modifica]").forEach((b) =>
    b.addEventListener("click", () => {
      const p = persone[Number(b.dataset.modifica)];
      apriFormPersona(p, {
        tipo: p.tipo,
        onSalvata: async (_salvata, { tipo }) => {
          if (tipo && tipo !== p.tipo) await aggiungiAlGruppo(id, p.id, tipo);
          ricarica();
        },
      });
    })
  );

  container.querySelectorAll("[data-togli]").forEach((b) =>
    b.addEventListener("click", async () => {
      const p = persone[Number(b.dataset.togli)];
      if (!confirm(`Togliere ${p.cognome} ${p.nome} dal gruppo? Resta in archivio.`)) return;
      await rimuoviDalGruppo(id, p.id);
      ricarica();
    })
  );

  container.querySelector("#aggiungi-persona").addEventListener("click", () => {
    apriCercaPersona({
      escludi: new Set(persone.map((p) => p.id)),
      onScelta: async (personaId) => {
        await aggiungiAlGruppo(id, personaId);
        ricarica();
      },
      onNuova: () =>
        apriFormPersona(null, {
          tipo: "Partecipante",
          onSalvata: async (nuova, { tipo }) => {
            await aggiungiAlGruppo(id, nuova.id, tipo || "Partecipante");
            ricarica();
          },
        }),
    });
  });

  container.querySelector("#del-gruppo").addEventListener("click", async () => {
    await eliminaGruppo(id);
    location.hash = "#/";
  });
}
