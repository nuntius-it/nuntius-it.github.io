import "./style.css";
import { getProfilo, salvaParrocchia } from "./lib/db.js";
import { avviaWa } from "./lib/wa.js";
import { esc } from "./ui/html.js";
import { viewGruppi } from "./views/gruppi.js";
import { viewImporta } from "./views/importa.js";
import { viewGruppo } from "./views/gruppo.js";
import { viewListe } from "./views/liste.js";
import { viewNuovaLista } from "./views/nuovaLista.js";
import { viewLista } from "./views/lista.js";
import { viewCampagne } from "./views/campagne.js";
import { viewNuovaCampagna } from "./views/nuovaCampagna.js";
import { viewCampagna } from "./views/campagna.js";
import { viewWhatsApp } from "./views/whatsapp.js";
import { viewBackup } from "./views/backup.js";

const app = document.querySelector("#app");

// ---------- Router ----------

const routes = [
  { re: /^#?\/?$/, view: viewGruppi, nav: "gruppi" },
  { re: /^#\/importa$/, view: viewImporta, nav: "importa" },
  { re: /^#\/gruppo\/([\w-]+)$/, view: viewGruppo, nav: "gruppi" },
  { re: /^#\/liste$/, view: viewListe, nav: "liste" },
  { re: /^#\/nuova-lista$/, view: viewNuovaLista, nav: "liste" },
  { re: /^#\/lista\/([\w-]+)$/, view: viewLista, nav: "liste" },
  { re: /^#\/campagne$/, view: viewCampagne, nav: "campagne" },
  { re: /^#\/nuova-campagna$/, view: viewNuovaCampagna, nav: "campagne" },
  { re: /^#\/campagna\/([\w-]+)$/, view: viewCampagna, nav: "campagne" },
  { re: /^#\/whatsapp$/, view: viewWhatsApp, nav: "whatsapp" },
  { re: /^#\/backup$/, view: viewBackup, nav: "backup" },
];

function matchRoute() {
  for (const r of routes) {
    const m = location.hash.match(r.re);
    if (m) return { ...r, params: { id: m[1] } };
  }
  return { ...routes[0], params: {} };
}

// ---------- Shell ----------

function renderShell(nomeParrocchia, navAttiva) {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/">
        <img src="icon.svg" alt="" class="logo" />
        <span class="brand-name">Nuntius</span>
      </a>
      <nav class="nav">
        <a href="#/" class="${navAttiva === "gruppi" ? "on" : ""}">Gruppi</a>
        <a href="#/liste" class="${navAttiva === "liste" ? "on" : ""}">Liste</a>
        <a href="#/campagne" class="${navAttiva === "campagne" ? "on" : ""}">Annunci</a>
        <a href="#/importa" class="${navAttiva === "importa" ? "on" : ""}">Importa</a>
        <a href="#/whatsapp" class="${navAttiva === "whatsapp" ? "on" : ""}">Invio</a>
        <a href="#/backup" class="${navAttiva === "backup" ? "on" : ""}">Backup</a>
      </nav>
      <div class="who">
        <span>${esc(nomeParrocchia)}</span>
      </div>
    </header>
    <main id="view" class="view"></main>
    <footer class="footer">Nuntius · <em>nuntius, -ii: messaggero</em></footer>
  `;
  return document.querySelector("#view");
}

async function renderApp() {
  const profilo = await getProfilo();
  const route = matchRoute();
  const view = renderShell(profilo.nomeParrocchia, route.nav);
  try {
    await route.view(view, route.params);
  } catch (err) {
    view.innerHTML = `<p class="error">Qualcosa è andato storto: ${esc(err.message)}</p>`;
  }
}

// ---------- Primo avvio ----------

function renderPrimoAvvio() {
  app.innerHTML = `
    <div class="login-wrap">
      <header class="login-head">
        <img src="icon.svg" alt="" class="logo logo--big" />
        <h1>Nuntius</h1>
        <p class="tagline">Annunci alle comunità parrocchiali</p>
      </header>
      <main class="card">
        <h2>Benvenuti!</h2>
        <p>Prima di cominciare, come si chiama la parrocchia?
        Il nome comparirà solo in alto nell'app.</p>
        <form id="setup-form">
          <label>Nome della parrocchia
            <input name="nome" required placeholder="es. Parrocchia S. Chiara — Trani" />
          </label>
          <label>Diocesi <small>(facoltativa)</small>
            <input name="diocesi" placeholder="es. Trani-Barletta-Bisceglie" />
          </label>
          <button type="submit" class="btn">Comincia</button>
        </form>
      </main>
      <footer class="footer">Nuntius · <em>nuntius, -ii: messaggero</em></footer>
    </div>`;
  document.querySelector("#setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const nome = form.get("nome").trim();
    if (!nome) return;
    await salvaParrocchia(nome, form.get("diocesi").trim() || null);
    start();
  });
}

function renderFuoriApp() {
  app.innerHTML = `
    <div class="login-wrap">
      <main class="card">
        <h2>Questa pagina va aperta dall'app Nuntius</h2>
        <p>Nuntius funziona come applicazione installata sul computer della
        parrocchia: i dati restano lì e non passano da internet.
        Scarica l'app da
        <a href="https://github.com/nuntius-it/nuntius-it.github.io/releases/latest">l'ultima
        release</a> e aprila.</p>
      </main>
    </div>`;
}

// ---------- Avvio ----------

async function start() {
  if (!window.nuntius?.db) return renderFuoriApp();
  const profilo = await getProfilo();
  if (!profilo) return renderPrimoAvvio();
  avviaWa(); // aggancia WhatsApp in sottofondo: il QR compare nella scheda Invio
  renderApp();
}

window.addEventListener("hashchange", start);

start();
