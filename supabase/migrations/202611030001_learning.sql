-- Run once in the Supabase SQL editor or via supabase db push.
create table public.learning_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000000),
  updated_at timestamptz not null default now()
);
alter table public.learning_snapshots enable row level security;
create policy "Read own library" on public.learning_snapshots for select to authenticated using ((select auth.uid()) = user_id);
-- Writes are restricted to the compare-and-swap RPC. No direct client write policies.
revoke all on public.learning_snapshots from anon, authenticated;
grant select on public.learning_snapshots to authenticated;
create function public.save_learning_snapshot(expected_revision bigint, snapshot jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare result bigint; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(snapshot) is distinct from 'object' or snapshot->>'version' is distinct from '2' or jsonb_typeof(snapshot->'sets') is distinct from 'array' or jsonb_typeof(snapshot->'platform') is distinct from 'object' or octet_length(snapshot::text) > 20000000 then raise exception 'Invalid or oversized snapshot'; end if;
  if expected_revision = 0 then
    insert into public.learning_snapshots(user_id, revision, payload) values(actor,1,snapshot) on conflict (user_id) do nothing returning revision into result;
  else
    update public.learning_snapshots set revision = revision + 1, payload = snapshot, updated_at = now() where user_id = actor and revision = expected_revision returning revision into result;
  end if;
  return result; -- null indicates a concurrent edit; client must resolve explicitly
end;
$$;
revoke all on function public.save_learning_snapshot(bigint,jsonb) from public, anon;
grant execute on function public.save_learning_snapshot(bigint,jsonb) to authenticated;
