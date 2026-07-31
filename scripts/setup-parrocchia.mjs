// Onboarding di una parrocchia su Nuntius: crea (o recupera) l'utente auth,
// imposta una password generata casualmente e collega le righe `parrocchie`
// e `profili`. Da eseguire dall'amministratore, MAI dalla parrocchia.
//
// Uso:
//   SB_URL=https://<progetto>.supabase.co SB_SECRET=sb_secret_... \
//     node scripts/setup-parrocchia.mjs <email> "<nome parrocchia>" "<diocesi>"
//
// Esempio:
//   node scripts/setup-parrocchia.mjs sanpaolo@example.it "S. Paolo - Barletta (BT)" "Trani-Barletta-Bisceglie"
//
// ATTENZIONE: se l'utente esiste già la sua password viene REIMPOSTATA.
import crypto from "node:crypto";

const SB = process.env.SB_URL;
const KEY = process.env.SB_SECRET;
const [EMAIL, NOME, DIOCESI] = process.argv.slice(2);

if (!SB || !KEY || !EMAIL || !NOME) {
  console.error('Uso: SB_URL=... SB_SECRET=... node scripts/setup-parrocchia.mjs <email> "<nome parrocchia>" ["<diocesi>"]');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function api(path, opts = {}) {
  const res = await fetch(`${SB}${path}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// 1. Utente auth: riusa se esiste (reimpostandone la password).
const { users } = await api(`/auth/v1/admin/users?page=1&per_page=200`);
let user = users.find((u) => u.email === EMAIL.toLowerCase());
const password = crypto.randomBytes(12).toString("base64url").slice(0, 16);
if (user) {
  await api(`/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
  console.log(`utente esistente riusato: ${user.id} (password reimpostata)`);
} else {
  user = await api(`/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password, email_confirm: true }),
  });
  console.log(`utente creato: ${user.id}`);
}

// 2. Parrocchia (riusa se esiste già con lo stesso nome).
const esistenti = await api(`/rest/v1/parrocchie?nome=eq.${encodeURIComponent(NOME)}&select=id`);
let parrocchiaId = esistenti[0]?.id;
if (!parrocchiaId) {
  const [row] = await api(`/rest/v1/parrocchie`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ nome: NOME, diocesi: DIOCESI ?? null }),
  });
  parrocchiaId = row.id;
}
console.log(`parrocchia: ${parrocchiaId}`);

// 3. Profilo utente -> parrocchia (upsert).
await api(`/rest/v1/profili`, {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates" },
  body: JSON.stringify({ user_id: user.id, parrocchia_id: parrocchiaId }),
});
console.log("profilo collegato");
console.log(`CREDENZIALI -> email: ${EMAIL} password: ${password}`);
console.log("Comunica le credenziali alla parrocchia per un canale sicuro (non via email in chiaro).");
