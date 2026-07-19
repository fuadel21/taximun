-- Permanent SOS and safety incident audit trail

create table if not exists public.taxi_safety_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.taxi_safety_reports(id) on delete restrict,
  ride_id uuid null,
  event_type text not null,
  previous_status text null,
  new_status text null,
  actor_id text null,
  actor_role text null,
  note text null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists taxi_safety_report_events_report_created_idx
  on public.taxi_safety_report_events(report_id, created_at desc);

create index if not exists taxi_safety_report_events_ride_created_idx
  on public.taxi_safety_report_events(ride_id, created_at desc)
  where ride_id is not null;

alter table public.taxi_safety_report_events enable row level security;
alter table public.taxi_safety_report_events force row level security;

revoke all on public.taxi_safety_report_events from public, anon, authenticated;
grant select on public.taxi_safety_report_events to authenticated;
grant all on public.taxi_safety_report_events to service_role;

drop policy if exists taxi_safety_events_admin_select on public.taxi_safety_report_events;
create policy taxi_safety_events_admin_select
on public.taxi_safety_report_events
for select
to authenticated
using (public.is_admin());

create or replace function public.taximun_audit_safety_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_actor_id text;
  v_actor_role text;
  v_event_type text;
begin
  v_actor_id := nullif(current_setting('request.jwt.claim.sub', true), '');
  v_actor_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'system');

  if tg_op = 'INSERT' then
    v_event_type := case when new.category = 'sos' or new.priority = 'critical' then 'sos_created' else 'report_created' end;
    insert into public.taxi_safety_report_events(report_id, ride_id, event_type, new_status, actor_id, actor_role, note, snapshot)
    values (new.id, new.ride_id, v_event_type, new.status, coalesce(v_actor_id, new.reporter_id), coalesce(v_actor_role, new.reporter_role, 'system'), new.title, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_event_type := case
      when old.status is distinct from new.status then 'status_changed'
      when old.assigned_admin_id is distinct from new.assigned_admin_id then 'admin_assigned'
      when old.resolution_note is distinct from new.resolution_note then 'note_updated'
      else 'report_updated'
    end;
    insert into public.taxi_safety_report_events(report_id, ride_id, event_type, previous_status, new_status, actor_id, actor_role, note, snapshot)
    values (new.id, new.ride_id, v_event_type, old.status, new.status, coalesce(v_actor_id, new.assigned_admin_id), v_actor_role, new.resolution_note, jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_safety_report_audit_trigger on public.taxi_safety_reports;
create trigger taximun_safety_report_audit_trigger
after insert or update on public.taxi_safety_reports
for each row execute function public.taximun_audit_safety_report();

insert into public.taxi_safety_report_events(report_id, ride_id, event_type, new_status, actor_id, actor_role, note, snapshot, created_at)
select r.id, r.ride_id,
  case when r.category = 'sos' or r.priority = 'critical' then 'sos_imported' else 'report_imported' end,
  r.status, r.reporter_id, r.reporter_role,
  'Registro histórico importado al activar la auditoría permanente',
  to_jsonb(r), coalesce(r.created_at, now())
from public.taxi_safety_reports r
where not exists (select 1 from public.taxi_safety_report_events e where e.report_id = r.id);
