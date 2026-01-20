-- Commander Deckbuilder schema (Supabase Postgres)
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run

create extension if not exists "pgcrypto";

-- Helper: updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Decks
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  format text not null default 'commander',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger decks_set_updated_at
before update on public.decks
for each row execute function public.set_updated_at();

-- Columns (Trello style lists)
create table if not exists public.deck_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  name text not null,
  column_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deck_columns_deck_id_idx on public.deck_columns(deck_id);
create index if not exists deck_columns_user_id_idx on public.deck_columns(user_id);

create trigger deck_columns_set_updated_at
before update on public.deck_columns
for each row execute function public.set_updated_at();

-- Cards in a deck
create table if not exists public.deck_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  column_id uuid not null references public.deck_columns(id) on delete cascade,
  scryfall_id text not null,
  qty integer not null default 1,
  sort_order integer not null default 0,
  card_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deck_cards_qty_positive check (qty > 0),
  constraint deck_cards_unique_per_column unique (deck_id, column_id, scryfall_id)
);

create index if not exists deck_cards_deck_id_idx on public.deck_cards(deck_id);
create index if not exists deck_cards_column_id_idx on public.deck_cards(column_id);
create index if not exists deck_cards_user_id_idx on public.deck_cards(user_id);
create index if not exists deck_cards_scryfall_id_idx on public.deck_cards(scryfall_id);

create trigger deck_cards_set_updated_at
before update on public.deck_cards
for each row execute function public.set_updated_at();

-- Row Level Security
alter table public.decks enable row level security;
alter table public.deck_columns enable row level security;
alter table public.deck_cards enable row level security;

-- Decks policies
create policy "decks_select_own" on public.decks
for select using (user_id = auth.uid());

create policy "decks_insert_own" on public.decks
for insert with check (user_id = auth.uid());

create policy "decks_update_own" on public.decks
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "decks_delete_own" on public.decks
for delete using (user_id = auth.uid());

-- Columns policies
create policy "deck_columns_select_own" on public.deck_columns
for select using (user_id = auth.uid());

create policy "deck_columns_insert_own" on public.deck_columns
for insert with check (user_id = auth.uid());

create policy "deck_columns_update_own" on public.deck_columns
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "deck_columns_delete_own" on public.deck_columns
for delete using (user_id = auth.uid());

-- Cards policies
create policy "deck_cards_select_own" on public.deck_cards
for select using (user_id = auth.uid());

create policy "deck_cards_insert_own" on public.deck_cards
for insert with check (user_id = auth.uid());

create policy "deck_cards_update_own" on public.deck_cards
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "deck_cards_delete_own" on public.deck_cards
for delete using (user_id = auth.uid());

-- Helpful view (optional): total qty per deck
create or replace view public.deck_card_totals as
select deck_id, sum(qty) as total_cards
from public.deck_cards
group by deck_id;
