-- =============================================================================
-- Nuntius — schema del database (Fase 1)
-- Da eseguire nell'SQL Editor del progetto Supabase (regione UE).
-- Modello: un account (auth.users) per parrocchia, condiviso tra i catechisti.
-- Ogni tabella è isolata per parrocchia tramite Row Level Security.
-- =============================================================================

-- ---------- Parrocchie e profili utente ----------

create table public.parrocchie (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  diocesi text,
  created_at timestamptz not null default now()
);

create table public.profili (
  user_id uuid primary key references auth.users (id) on delete cascade,
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Parrocchia dell'utente autenticato (security definer per usarla nelle policy).
create or replace function public.parrocchia_corrente()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select parrocchia_id from public.profili where user_id = auth.uid()
$$;

-- ---------- Anagrafica e gruppi ----------

create table public.persone (
  id uuid primary key default gen_random_uuid(),
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  cognome text not null,
  nome text not null,
  data_nascita date,
  cellulare text,           -- normalizzato E.164 (+39...), può essere null
  telefono_raw text,        -- valore originale dell'import, per diagnostica
  cellulare_raw text,
  email text,
  indirizzo text,
  comune text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gruppi (
  id uuid primary key default gen_random_uuid(),
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  nome text not null,           -- es. "Catechismo — 3a media"
  attivita text,                -- es. "Catechismo" (dal CSV UNIO)
  anno text,                    -- es. "2025/2026"
  archiviato boolean not null default false,
  created_at timestamptz not null default now(),
  unique (parrocchia_id, nome, anno)
);

create table public.appartenenze (
  persona_id uuid not null references public.persone (id) on delete cascade,
  gruppo_id uuid not null references public.gruppi (id) on delete cascade,
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  tipo text not null default 'Partecipante',  -- Partecipante | Responsabile
  primary key (persona_id, gruppo_id)
);

-- ---------- Liste (sottogruppi temporanei / eventi) ----------

create table public.liste (
  id uuid primary key default gen_random_uuid(),
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  nome text not null,           -- es. "Festa di Carnevale 2027"
  descrizione text,
  created_at timestamptz not null default now()
);

create table public.liste_persone (
  lista_id uuid not null references public.liste (id) on delete cascade,
  persona_id uuid not null references public.persone (id) on delete cascade,
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  primary key (lista_id, persona_id)
);

-- ---------- Messaggi ----------

create table public.template (
  id uuid primary key default gen_random_uuid(),
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  titolo text not null,
  testo text not null,
  created_at timestamptz not null default now()
);

create table public.campagne (
  id uuid primary key default gen_random_uuid(),
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  titolo text not null,
  testo text not null,
  -- bozza -> pronta -> in_invio -> completata (o annullata)
  stato text not null default 'bozza'
    check (stato in ('bozza', 'pronta', 'in_invio', 'completata', 'annullata')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invii (
  id uuid primary key default gen_random_uuid(),
  campagna_id uuid not null references public.campagne (id) on delete cascade,
  parrocchia_id uuid not null references public.parrocchie (id) on delete cascade,
  persona_id uuid references public.persone (id) on delete set null,
  numero text not null,         -- E.164, denormalizzato: resta anche se la persona è eliminata
  -- in_coda -> inviato | non_whatsapp | errore
  esito text not null default 'in_coda'
    check (esito in ('in_coda', 'inviato', 'non_whatsapp', 'errore')),
  dettaglio text,
  inviato_at timestamptz
);

create index invii_campagna_idx on public.invii (campagna_id);
create index persone_parrocchia_idx on public.persone (parrocchia_id);
create index appartenenze_gruppo_idx on public.appartenenze (gruppo_id);

-- ---------- Row Level Security ----------

-- parrocchie: l'utente vede solo la propria (nessun insert/update da client).
alter table public.parrocchie enable row level security;
create policy parrocchie_select on public.parrocchie
  for select using (id = public.parrocchia_corrente());

-- profili: l'utente vede solo il proprio profilo.
alter table public.profili enable row level security;
create policy profili_select on public.profili
  for select using (user_id = auth.uid());

-- Tabelle dati: accesso completo ma solo alle righe della propria parrocchia.
do $$
declare t text;
begin
  foreach t in array array[
    'persone', 'gruppi', 'appartenenze', 'liste', 'liste_persone',
    'template', 'campagne', 'invii'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all
         using (parrocchia_id = public.parrocchia_corrente())
         with check (parrocchia_id = public.parrocchia_corrente())',
      t || '_parrocchia', t
    );
  end loop;
end $$;

-- =============================================================================
-- Creazione di una nuova parrocchia (da eseguire a mano per ogni onboarding):
-- 1. Dashboard → Authentication → Add user (email + password della parrocchia)
-- 2. insert into public.parrocchie (nome, diocesi)
--      values ('S. Chiara - Trani (BT)', 'Trani-Barletta-Bisceglie') returning id;
-- 3. insert into public.profili (user_id, parrocchia_id)
--      values ('<uuid utente auth>', '<uuid parrocchia>');
-- =============================================================================
