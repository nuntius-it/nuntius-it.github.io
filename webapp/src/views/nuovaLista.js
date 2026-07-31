import { fetchGruppi, fetchPersone, creaLista } from "../lib/db.js";
import { dedupePhones } from "../lib/phone.js";
import { birthYear, formatItalianDate } from "../lib/dates.js";
import { classeLabel, annoScolasticoCorrente } from "../lib/scuola.js";
import { esc, chip, spinner } from "../ui/html.js";

/**
 * Costruttore di liste: scegli i gruppi di partenza, filtra per classe,
 * ritocca a mano, salva con un nome.
 */
export async function viewNuovaLista(container) {
  container.innerHTML = spinner();
  const [gruppi, persone] = await Promise.all([fetchGruppi(), fetchPersone()]);
  const annoScol = annoScolasticoCorrente();

  // Stato del costruttore.
  const stato = {
    gruppiSelezionati: new Set(),
    classiSelezionate: new Set(), // vuoto = tutte
    escluse: new Set(),           // persone deselezionate a mano
    incluse: new Set(),           // persone ri-selezionate a mano
  };

  const classeDi = (p) => classeLabel(birthYear(p.data_nascita), annoScol);

  const candidate = () =>
    persone.filter((p) =>
      p.appartenenze?.some((a) => stato.gruppiSelezionati.has(a.gruppo_id))
    );

  const classiDisponibili = () => {
    const set = new Set();
    for (const p of candidate()) {
      const c = classeDi(p);
      if (c) set.add(c);
    }
    return set;
  };

  const selezionate = () =>
    candidate().filter((p) => {
      if (stato.escluse.has(p.id)) return false;
      if (stato.incluse.has(p.id)) return true;
      if (!stato.classiSelezionate.size) return true;
      const c = classeDi(p);
      return c ? stato.classiSelezionate.has(c) : false;
    });

  function render() {
    const cand = candidate();
    const sel = selezionate();
    const selIds = new Set(sel.map((p) => p.id));
    const numeri = dedupePhones(sel.map((p) => p.cellulare));
    const classi = [...classiDisponibili()];

    container.innerHTML = `
      <div class="page-head">
        <h2>Nuova lista</h2>
        <a class="btn btn--ghost" href="#/liste">← Liste</a>
      </div>

      <section class="card-soft">
        <h3>1 · Da quali gruppi?</h3>
        <div class="chips" id="gruppi-chips">
          ${gruppi
            .map(
              (g) => `
            <button type="button" class="chip chip--toggle ${stato.gruppiSelezionati.has(g.id) ? "chip--on" : ""}"
              data-gruppo="${g.id}">${esc(g.nome)}${g.anno ? ` · ${esc(g.anno)}` : ""}</button>`
            )
            .join("")}
        </div>
        ${!gruppi.length ? `<p class="hint">Prima <a href="#/importa">importa un elenco</a>.</p>` : ""}
      </section>

      ${cand.length ? `
      <section class="card-soft">
        <h3>2 · Filtra per classe <small>(facoltativo, stimata dall'anno di nascita)</small></h3>
        <div class="chips" id="classi-chips">
          ${classi
            .map(
              (c) => `
            <button type="button" class="chip chip--toggle ${stato.classiSelezionate.has(c) ? "chip--on" : ""}"
              data-classe="${esc(c)}">${esc(c)}</button>`
            )
            .join("")}
        </div>
        <p class="hint">Nessuna classe selezionata = tutte. Esempio "dalla 5ª in su":
        seleziona 5ª elementare e le classi successive.</p>
      </section>

      <section class="card-soft">
        <h3>3 · Controlla le persone</h3>
        <div class="stats-inline">
          <strong>${sel.length}</strong> persone selezionate ·
          <strong>${numeri.length}</strong> numeri WhatsApp unici
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th></th><th>Nominativo</th><th>Classe</th><th>Cellulare</th></tr></thead>
            <tbody>
              ${cand
                .map((p) => {
                  const c = classeDi(p);
                  return `
                <tr class="${selIds.has(p.id) ? "" : "row--off"}">
                  <td><input type="checkbox" data-persona="${p.id}" ${selIds.has(p.id) ? "checked" : ""}></td>
                  <td>${esc(p.cognome)} ${esc(p.nome)}</td>
                  <td>${c ? esc(c) : `<span class="muted">${esc(formatItalianDate(p.data_nascita) || "—")}</span>`}</td>
                  <td>${p.cellulare ? esc(p.cellulare) : chip("senza cellulare", "warn")}</td>
                </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card-soft">
        <h3>4 · Salva la lista</h3>
        <form id="salva-lista" class="form-row">
          <label>Nome della lista
            <input name="nome" required placeholder="es. Festa di Carnevale — dalla 5ª in su" />
          </label>
          <button type="submit" class="btn" ${sel.length ? "" : "disabled"}>
            Salva (${sel.length} persone)
          </button>
        </form>
      </section>` : ""}`;

    // Eventi
    container.querySelectorAll("[data-gruppo]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.gruppo;
        stato.gruppiSelezionati.has(id)
          ? stato.gruppiSelezionati.delete(id)
          : stato.gruppiSelezionati.add(id);
        stato.escluse.clear();
        stato.incluse.clear();
        render();
      })
    );
    container.querySelectorAll("[data-classe]").forEach((b) =>
      b.addEventListener("click", () => {
        const c = b.dataset.classe;
        stato.classiSelezionate.has(c)
          ? stato.classiSelezionate.delete(c)
          : stato.classiSelezionate.add(c);
        stato.escluse.clear();
        stato.incluse.clear();
        render();
      })
    );
    container.querySelectorAll("[data-persona]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const id = cb.dataset.persona;
        if (cb.checked) {
          stato.escluse.delete(id);
          stato.incluse.add(id);
        } else {
          stato.incluse.delete(id);
          stato.escluse.add(id);
        }
        render();
      })
    );
    container.querySelector("#salva-lista")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nome = new FormData(e.target).get("nome").trim();
      const ids = selezionate().map((p) => p.id);
      if (!nome || !ids.length) return;
      container.innerHTML = spinner("Salvataggio…");
      const lista = await creaLista(nome, null, ids);
      location.hash = `#/lista/${lista.id}`;
    });
  }

  render();
}
