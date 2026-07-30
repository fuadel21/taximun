-- PR #128 corrected · Enforce complete and current driver documentation before approval

create or replace function public.taximun_driver_document_requirements(
  p_driver_id text
)
returns table (
  document_type text,
  label text,
  requirement_status text,
  document_id uuid,
  document_status text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with required(document_type, label, sort_order) as (
    values
      ('identity'::text, 'Identidad / DNI / NIE'::text, 1),
      ('driver_license'::text, 'Permiso de conducir'::text, 2),
      ('taxi_license'::text, 'Licencia taxi'::text, 3),
      ('insurance'::text, 'Seguro'::text, 4),
      ('vehicle_inspection'::text, 'Inspección / ITV'::text, 5)
  ), latest as (
    select distinct on (d.document_type)
      d.id,
      d.document_type,
      d.status,
      d.expires_at,
      d.created_at
    from public.taxi_driver_documents d
    where d.driver_id = p_driver_id
      and d.document_type in ('identity', 'driver_license', 'taxi_license', 'insurance', 'vehicle_inspection')
    order by d.document_type, d.created_at desc, d.id desc
  )
  select
    r.document_type,
    r.label,
    case
      when l.id is null then 'missing'
      when l.status = 'rejected' then 'rejected'
      when l.status = 'expired' then 'expired'
      when l.expires_at is not null and l.expires_at < now() then 'expired'
      when l.status = 'approved' then 'approved'
      else 'pending'
    end as requirement_status,
    l.id as document_id,
    l.status::text as document_status,
    l.expires_at
  from required r
  left join latest l on l.document_type = r.document_type
  order by r.sort_order;
$$;

revoke all on function public.taximun_driver_document_requirements(text) from public;
revoke all on function public.taximun_driver_document_requirements(text) from anon;
revoke all on function public.taximun_driver_document_requirements(text) from authenticated;
grant execute on function public.taximun_driver_document_requirements(text) to service_role;

create or replace function public.taximun_enforce_driver_documents_before_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_missing_labels text;
begin
  if new.role is distinct from 'driver' then
    return new;
  end if;

  if coalesce(new.is_verified, false) = true
     or new.verification_status = 'approved' then
    select string_agg(label || ' (' || requirement_status || ')', ', ' order by label)
    into v_missing_labels
    from public.taximun_driver_document_requirements(new.user_id)
    where requirement_status <> 'approved';

    if v_missing_labels is not null then
      raise exception using
        errcode = 'P0001',
        message = 'DRIVER_DOCUMENTS_INCOMPLETE: ' || v_missing_labels,
        hint = 'Revisa y aprueba el envío más reciente de cada documento obligatorio antes de aprobar al conductor.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_enforce_driver_documents_before_approval
on public.taxi_user_profiles;

create trigger taximun_enforce_driver_documents_before_approval
before insert or update of role, is_verified, verification_status
on public.taxi_user_profiles
for each row
execute function public.taximun_enforce_driver_documents_before_approval();

create index if not exists taxi_driver_documents_latest_requirement_idx
  on public.taxi_driver_documents(driver_id, document_type, created_at desc)
  where document_type in ('identity', 'driver_license', 'taxi_license', 'insurance', 'vehicle_inspection');
