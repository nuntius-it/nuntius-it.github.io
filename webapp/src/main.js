import "./style.css";
import { supabase, isConfigured } from "./lib/supabase.js";

const app = document.querySelector("#app");

function shell(content) {
  app.innerHTML = `
    <header class="topbar">
      <img src="/icon.svg" alt="" class="logo" />
      <div>
        <h1>Nuntius</h1>
        <p class="tagline">Annunci alle comunità parrocchiali</p>
      </div>
    </header>
    <main class="card">${content}</main>
    <footer class="footer">Nuntius · <em>nuntius, -ii: messaggero</em></footer>
  `;
}

function renderNonConfigurato() {
  shell(`
    <h2>Configurazione mancante</h2>
    <p>La connessione al database non è ancora configurata
    (<code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>).</p>
    <p>Se vedi questa pagina online, l'amministratore deve impostare i
    <em>secrets</em> del deploy. In locale: copia <code>.env.example</code> in
    <code>.env</code> e riavvia <code>npm run dev</code>.</p>
  `);
}

function renderLogin(messaggio = "") {
  shell(`
    <h2>Accesso parrocchia</h2>
    ${messaggio ? `<p class="error" role="alert">${messaggio}</p>` : ""}
    <form id="login-form">
      <label>Email della parrocchia
        <input type="email" name="email" required autocomplete="username" />
      </label>
      <label>Password
        <input type="password" name="password" required autocomplete="current-password" />
      </label>
      <button type="submit">Entra</button>
    </form>
  `);
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

async function renderHome(session) {
  const { data: profilo } = await supabase
    .from("profili")
    .select("parrocchia_id, parrocchie(nome)")
    .eq("user_id", session.user.id)
    .maybeSingle();
  const nomeParrocchia = profilo?.parrocchie?.nome ?? session.user.email;
  shell(`
    <h2>Benvenuti, ${nomeParrocchia}</h2>
    <p>Da qui potrai importare gli elenchi, gestire i gruppi e preparare gli
    annunci. Le funzioni arrivano nelle prossime fasi di sviluppo.</p>
    <button id="logout">Esci</button>
  `);
  document.querySelector("#logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    start();
  });
}

async function start() {
  if (!isConfigured) return renderNonConfigurato();
  const { data } = await supabase.auth.getSession();
  if (data.session) renderHome(data.session);
  else renderLogin();
}

start();
