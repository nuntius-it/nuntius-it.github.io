const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

function mostra(step) {
  for (const id of ["step-login", "step-wa", "step-campagne"]) {
    $(`#${id}`).hidden = id !== step;
  }
  $("#log-box").hidden = step === "step-login";
}

// ---------- Log ----------

window.nuntius.onLog((msg) => {
  const pre = $("#log");
  pre.textContent += msg + "\n";
  pre.scrollTop = pre.scrollHeight;
});

// ---------- Flusso ----------

async function avvioWhatsApp() {
  mostra("step-wa");
  window.nuntius.waAvvia();
}

window.nuntius.onQr((dataUrl) => {
  $("#qr").src = dataUrl;
});

window.nuntius.onWaPronto((pronto) => {
  if (pronto) {
    mostra("step-campagne");
    caricaCampagne();
  } else {
    avvioWhatsApp();
  }
});

async function caricaCampagne() {
  const box = $("#campagne");
  box.innerHTML = "<p class='hint'>Carico gli annunci…</p>";
  const res = await window.nuntius.campagnePronte();
  if (!res.ok) {
    box.innerHTML = `<p class="error">${esc(res.errore)}</p>`;
    return;
  }
  if (!res.campagne.length) {
    box.innerHTML = `<p class="empty">Nessun annuncio pronto. Preparane uno dalla
      web app Nuntius e segnalo "pronto per l'invio".</p>`;
    return;
  }
  box.innerHTML = res.campagne
    .map(
      (c) => `
    <div class="campagna" data-id="${c.id}">
      <div class="campagna-info">
        <strong>${esc(c.titolo)}</strong>
        <span class="meta">${new Date(c.created_at).toLocaleDateString("it-IT")} ·
          ${c.destinatari} destinatari ${c.stato === "in_invio" ? "· ripresa invio" : ""}</span>
        <div class="testo">${esc(c.testo).slice(0, 220)}${c.testo.length > 220 ? "…" : ""}</div>
      </div>
      <div class="campagna-azioni">
        <button class="btn" data-invia="${c.id}">Invia ora</button>
        <progress hidden max="1" value="0"></progress>
      </div>
    </div>`
    )
    .join("");

  box.querySelectorAll("[data-invia]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      b.textContent = "Invio in corso…";
      const card = b.closest(".campagna");
      card.querySelector("progress").hidden = false;
      const res2 = await window.nuntius.campagnaInvia(b.dataset.invia);
      if (!res2.ok) alertBox(card, res2.errore);
      caricaCampagne();
    })
  );
}

function alertBox(el, msg) {
  const p = document.createElement("p");
  p.className = "error";
  p.textContent = msg;
  el.appendChild(p);
}

window.nuntius.onProgresso(({ campagnaId, fatto, totale }) => {
  const bar = document.querySelector(`.campagna[data-id="${campagnaId}"] progress`);
  if (bar) {
    bar.hidden = false;
    bar.max = totale;
    bar.value = fatto;
  }
});

// ---------- Login ----------

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const res = await window.nuntius.login(form.get("email"), form.get("password"));
  if (!res.ok) {
    $("#login-errore").textContent = res.errore;
    $("#login-errore").hidden = false;
    return;
  }
  intestazione(res.parrocchia);
  avvioWhatsApp();
});

$("#logout").addEventListener("click", async () => {
  await window.nuntius.logout();
  location.reload();
});

$("#aggiorna").addEventListener("click", caricaCampagne);

$("#prova-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  $("#prova-esito").textContent = "…";
  const res = await window.nuntius.invioDiProva(form.get("numero"), form.get("testo"));
  $("#prova-esito").textContent = res.ok ? "✓ inviato" : `✗ ${res.errore}`;
});

function intestazione(parrocchia) {
  $("#who").hidden = false;
  $("#parrocchia").textContent = parrocchia ?? "";
}

// ---------- Avvio ----------

(async () => {
  const stato = await window.nuntius.statoIniziale();
  if (!stato.loggato) {
    mostra("step-login");
    return;
  }
  intestazione(stato.parrocchia);
  avvioWhatsApp();
})();
