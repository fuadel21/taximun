-- PR #145 · Atomic driver profile verification saves

create or replace function public.taximun_upsert_user_profile_atomic(
  p_user_id text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_existing public.taxi_user_profiles%rowtype;
  v_saved public.taxi_user_profiles%rowtype;
  v_role text := coalesce(nullif(trim(p_payload->>'role'), ''), 'passenger');
  v_professional_changed boolean := false;
  v_next_status text;
  v_next_verified boolean;
begin
  select *
  into v_existing
  from public.taxi_user_profiles
  where user_id = p_user_id
  for update;

  if found and v_role = 'driver' and v_existing.role = 'driver' then
    v_professional_changed :=
      coalesce(trim(v_existing.driver_license_number), '') is distinct from coalesce(trim(p_payload->>'driver_license_number'), '')
      or coalesce(trim(v_existing.taxi_code), '') is distinct from coalesce(trim(p_payload->>'taxi_code'), '')
      or coalesce(trim(v_existing.plate), '') is distinct from coalesce(trim(p_payload->>'plate'), '')
      or coalesce(trim(v_existing.vehicle_model), '') is distinct from coalesce(trim(p_payload->>'vehicle_model'), '')
      or coalesce(trim(v_existing.work_zone), '') is distinct from coalesce(trim(p_payload->>'work_zone'), '');
  end if;

  if v_role <> 'driver' then
    v_next_status := 'approved';
    v_next_verified := true;
  elsif not found then
    v_next_status := 'in_review';
    v_next_verified := false;
  elsif v_existing.role <> 'driver' or v_professional_changed then
    v_next_status := 'in_review';
    v_next_verified := false;
  else
    -- Preserve the latest locked state. A personal save cannot undo an admin
    -- rejection, a document-review transition, or a concurrent approval.
    v_next_status := v_existing.verification_status;
    v_next_verified := v_existing.is_verified;
  end if;

  insert into public.taxi_user_profiles (
    user_id,
    role,
    full_name,
    phone,
    avatar_url,
    preferred_payment_method,
    favorite_address,
    emergency_contact_name,
    emergency_contact_phone,
    driver_license_number,
    taxi_code,
    plate,
    vehicle_model,
    work_zone,
    verification_status,
    is_verified
  )
  values (
    p_user_id,
    v_role,
    nullif(trim(p_payload->>'full_name'), ''),
    nullif(trim(p_payload->>'phone'), ''),
    nullif(trim(p_payload->>'avatar_url'), ''),
    coalesce(nullif(trim(p_payload->>'preferred_payment_method'), ''), 'cash'),
    nullif(trim(p_payload->>'favorite_address'), ''),
    nullif(trim(p_payload->>'emergency_contact_name'), ''),
    nullif(trim(p_payload->>'emergency_contact_phone'), ''),
    nullif(trim(p_payload->>'driver_license_number'), ''),
    nullif(trim(p_payload->>'taxi_code'), ''),
    nullif(trim(p_payload->>'plate'), ''),
    nullif(trim(p_payload->>'vehicle_model'), ''),
    nullif(trim(p_payload->>'work_zone'), ''),
    v_next_status,
    v_next_verified
  )
  on conflict (user_id) do update
  set
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    avatar_url = excluded.avatar_url,
    preferred_payment_method = excluded.preferred_payment_method,
    favorite_address = excluded.favorite_address,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    driver_license_number = excluded.driver_license_number,
    taxi_code = excluded.taxi_code,
    plate = excluded.plate,
    vehicle_model = excluded.vehicle_model,
    work_zone = excluded.work_zone,
    verification_status = excluded.verification_status,
    is_verified = excluded.is_verified,
    updated_at = now()
  returning * into v_saved;

  return to_jsonb(v_saved);
end;
$$;

revoke all
on function public.taximun_upsert_user_profile_atomic(text, jsonb)
from public, anon, authenticated;

grant execute
on function public.taximun_upsert_user_profile_atomic(text, jsonb)
to service_role;
