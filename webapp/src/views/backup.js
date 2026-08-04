/**
 * Copie di sicurezza: stato del backup automatico, esportazione su file
 * (chiavetta/Drive) e ripristino — che è anche il modo per trasferire i dati
 * su un altro computer. I dialoghi e la sostituzione avvengono nel main.
 */
import { esc } from "../ui/html.js";

export async function viewBackup(container) {
  const info = await window.nuntius.backupInfo();
  const ultimo = info.ultimo
    ? new Date(info.ultimo).toLocaleString("it-IT")
    : "ancora nessuna (arriva col primo utilizzo)";

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Copie di sicurezza</h2>
        <p class="page-sub">I dati stanno solo su questo computer: una copia li protegge</p>
      </div>
    </div>

    <section class="card">
      <h2>Copia automatica</h2>
      <p>Ogni giorno l'app salva da sola una copia dei dati sul computer
      (ne conserva 14). Ultima copia automatica: <strong>${esc(ultimo)}</strong>.</p>
      <p class="hint">La copia automatica non protegge dal guasto del computer:
      ogni tanto esporta una copia su una chiavetta o su un servizio cloud
      (Drive, OneDrive…) con il pulsante qui sotto.</p>
    </section>

    <section class="card">
      <h2>Esporta una copia</h2>
      <p>Salva un file con tutti i dati (persone, gruppi, liste, annunci ed
      esiti). Conservalo in un posto sicuro.</p>
      <div class="actions">
        <button class="btn" id="esporta">Esporta una copia…</button>
        <span id="esporta-esito" class="hint"></span>
      </div>
    </section>

    <section class="card">
      <h2>Ripristina da una copia</h2>
      <p>Sostituisce i dati attuali con quelli di una copia esportata.
      Serve dopo un guasto, oppure per <strong>portare Nuntius su un altro
      computer</strong>: esporta la copia sul vecchio, ripristinala sul nuovo.</p>
      <p class="hint">Usa Nuntius su <strong>un computer alla volta</strong>:
      i dati non si sincronizzano da soli, vale la copia più recente.</p>
      <div class="actions">
        <button class="btn btn--ghost" id="ripristina">Ripristina da una copia…</button>
        <span id="ripristina-esito" class="hint"></span>
      </div>
    </section>`;

  container.querySelector("#esporta").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const esito = container.querySelector("#esporta-esito");
    b.disabled = true;
    esito.textContent = "…";
    const res = await window.nuntius.backupEsporta();
    b.disabled = false;
    esito.textContent = res.annullato ? "" : res.ok ? `✓ salvata in ${res.percorso}` : `✗ ${res.errore}`;
  });

  container.querySelector("#ripristina").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const esito = container.querySelector("#ripristina-esito");
    b.disabled = true;
    esito.textContent = "…";
    const res = await window.nuntius.backupRipristina();
    b.disabled = false;
    if (res.ok && !res.annullato) {
      location.reload(); // ricarica l'app sui dati ripristinati
      return;
    }
    esito.textContent = res.annullato ? "" : res.ok ? "" : `✗ ${res.errore}`;
  });
}
