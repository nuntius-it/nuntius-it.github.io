/**
 * Collegamento WhatsApp e diario degli invii (porting del vecchio renderer
 * di Nuntius Sender). L'invio vero e proprio parte dalla pagina dell'annuncio.
 */
import { statoWa, avviaWa, osservaWa, osservaLog } from "../lib/wa.js";
import { esc } from "../ui/html.js";

export async function viewWhatsApp(container) {
  avviaWa();
  osservaWa(() => dipingi(container));
  osservaLog(() => aggiornaDiario(container));
  dipingi(container);
}

function sezioneStato() {
  if (statoWa.pronto) {
    return `
      <section class="card">
        <h2>WhatsApp collegato ✓</h2>
        <p>Il computer è collegato al WhatsApp della parrocchia e può inviare.
        Per spedire un annuncio: <a href="#/campagne">Annunci</a> → apri
        l'annuncio pronto → <strong>Invia ora</strong>.</p>
      </section>`;
  }
  if (statoWa.sync) {
    const perc = Number.isFinite(statoWa.sync.percent) ? ` (${statoWa.sync.percent}%)` : "";
    return `
      <section class="card">
        <h2>Collega WhatsApp</h2>
        <div class="sync-box">
          <div class="spinner" aria-hidden="true"></div>
          <p><strong>Collegato! WhatsApp si sta caricando${perc}…</strong></p>
          <p class="hint">La prima volta può richiedere <strong>qualche minuto</strong>.
          Tenete aperta questa finestra e lasciate il telefono della parrocchia acceso e
          connesso a internet, senza scollegare il computer da WhatsApp.</p>
        </div>
      </section>`;
  }
  if (statoWa.qr) {
    return `
      <section class="card">
        <h2>Collega WhatsApp</h2>
        <p>Dal telefono della parrocchia: <strong>WhatsApp → Impostazioni →
        Dispositivi collegati → Collega un dispositivo</strong>, poi inquadra il codice.</p>
        <div class="qr-box"><img src="${statoWa.qr}" alt="Codice QR" /></div>
        <p class="hint">Serve solo la prima volta: le volte successive il collegamento
        viene ricordato.</p>
      </section>`;
  }
  return `
    <section class="card">
      <h2>Collega WhatsApp</h2>
      <div class="sync-box">
        <div class="spinner" aria-hidden="true"></div>
        <p>Un momento… Se il collegamento è già stato fatto in passato,
        il codice QR non serve: qui comparirà "collegato".</p>
      </div>
    </section>`;
}

function dipingi(container) {
  if (!container.isConnected) {
    // La vista non è più a schermo: sgancia gli osservatori.
    osservaWa(null);
    osservaLog(null);
    return;
  }
  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Invio WhatsApp</h2>
        <p class="page-sub">Il collegamento con il WhatsApp della parrocchia</p>
      </div>
    </div>
    ${sezioneStato()}
    ${statoWa.pronto ? `
      <details class="prova">
        <summary>Invio di prova (a un solo numero)</summary>
        <form id="prova-form">
          <label>Numero di cellulare
            <input name="numero" placeholder="es. 3471234567" required />
          </label>
          <label>Messaggio
            <input name="testo" value="Messaggio di prova da Nuntius 🕊️" required />
          </label>
          <button type="submit" class="btn btn--ghost">Invia prova</button>
          <span id="prova-esito"></span>
        </form>
      </details>` : ""}
    <section class="log-box">
      <h3>Diario</h3>
      <pre class="log" id="wa-log">${esc(statoWa.log.join("\n"))}</pre>
    </section>`;

  aggiornaDiario(container);

  container.querySelector("#prova-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const esito = container.querySelector("#prova-esito");
    esito.textContent = "…";
    const res = await window.nuntius.invioDiProva(form.get("numero"), form.get("testo"));
    esito.textContent = res.ok ? "✓ inviato" : `✗ ${res.errore}`;
  });
}

function aggiornaDiario(container) {
  const pre = container.querySelector("#wa-log");
  if (!pre) return;
  pre.textContent = statoWa.log.join("\n");
  pre.scrollTop = pre.scrollHeight;
}
