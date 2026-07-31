import "./style.css";
import { supabase, isConfigured } from "./lib/supabase.js";
import { getProfilo, resetProfilo } from "./lib/db.js";
import { esc } from "./ui/html.js";
import { viewGruppi } from "./views/gruppi.js";
import { viewImporta } from "./views/importa.js";
import { viewGruppo } from "./views/gruppo.js";
import { viewListe } from "./views/liste.js";
import { viewNuovaLista } from "./views/nuovaLista.js";
import { viewLista } from "./views/lista.js";

const app = document.querySelector("#app");

// ---------- Router ----------

const routes = [
  { re: /^#?\/?$/, view: viewGruppi, nav: "gruppi" },
  { re: /^#\/importa$/, view: viewImporta, nav: "importa" },
  { re: /^#\/gruppo\/([\w-]+)$/, view: viewGruppo, nav: "gruppi" },
  { re: /^#\/liste$/, view: viewListe, nav: "liste" },
  { re: /^#\/nuova-lista$/, view: viewNuovaLista, nav: "liste" },
  { re: /^#\/lista\/([\w-]+)$/, view: viewLista, nav: "liste" },
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
        <img src="/icon.svg" alt="" class="logo" />
        <span class="brand-name">Nuntius</span>
      </a>
      <nav class="nav">
        <a href="#/" class="${navAttiva === "gruppi" ? "on" : ""}">Gruppi</a>
        <a href="#/liste" class="${navAttiva === "liste" ? "on" : ""}">Liste</a>
        <a href="#/importa" class="${navAttiva === "importa" ? "on" : ""}">Importa</a>
      </nav>
      <div class="who">
        <span>${esc(nomeParrocchia)}</span>
        <button id="logout" class="btn-link">Esci</button>
      </div>
    </header>
    <main id="view" class="view"></main>
    <footer class="footer">Nuntius · <em>nuntius, -ii: messaggero</em></footer>
  `;
  document.querySelector("#logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    resetProfilo();
    start();
  });
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

// ---------- Login ----------

function renderLogin(messaggio = "") {
  app.innerHTML = `
    <div class="login-wrap">
      <header class="login-head">
        <img src="/icon.svg" alt="" class="logo logo--big" />
        <h1>Nuntius</h1>
        <p class="tagline">Annunci alle comunità parrocchiali</p>
      </header>
      <main class="card">
        <h2>Accesso parrocchia</h2>
        ${messaggio ? `<p class="error" role="alert">${esc(messaggio)}</p>` : ""}
        <form id="login-form">
          <label>Email della parrocchia
            <input type="email" name="email" required autocomplete="username" />
          </label>
          <label>Password
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
          <button type="submit" class="btn">Entra</button>
        </form>
      </main>
      <footer class="footer">Nuntius · <em>nuntius, -ii: messaggero</em></footer>
    </div>`;
  document.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (error) renderLogin("Credenziali non valide, riprova.");
    else start();
  });
}

function renderNonConfigurato() {
  app.innerHTML = `
    <div class="login-wrap">
      <main class="card">
        <h2>Configurazione mancante</h2>
        <p>La connessione al database non è ancora configurata
        (<code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>).</p>
      </main>
    </div>`;
}

// ---------- Avvio ----------

async function start() {
  if (!isConfigured) return renderNonConfigurato();
  const { data } = await supabase.auth.getSession();
  if (data.session) renderApp();
  else renderLogin();
}

window.addEventListener("hashchange", async () => {
  const { data } = await supabase?.auth.getSession() ?? { data: {} };
  if (data.session) renderApp();
});

start();
