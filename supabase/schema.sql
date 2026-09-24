-- Happi Bubbles cloud sync schema.
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Each shop owner account gets its own isolated data (row level security).

create table if not exists public.records (
  shop_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  collection  text   not null,
  id          text   not null,
  data        jsonb  not null,
  updated_at  bigint not null,
  deleted     boolean not null default false,
  server_seq  bigint not null default 0,
  primary key (shop_id, collection, id)
);

create sequence if not exists public.records_seq;

-- Stamp every write with a server-side sequence so devices can pull "everything since X",
-- and ignore writes that are older than what the server already has (last write wins).
create or replace function public.records_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_seq := nextval('public.records_seq');
  return new;
end $$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records
  for each row execute function public.records_stamp();

create index if not exists records_pull_idx on public.records (shop_id, server_seq);

alter table public.records enable row level security;

drop policy if exists "shop owns its records" on public.records;
create policy "shop owns its records" on public.records
  for all using (shop_id = auth.uid()) with check (shop_id = auth.uid());

-- Live updates between devices.
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;
