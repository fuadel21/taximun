-- Block unverified drivers from operating.
-- The backend calls this before allowing online status or ride acceptance.

create or replace function public.taximun_driver_can_operate(p_driver_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.taxi_user_profiles p
    where p.user_id = p_driver_id
      and p.role = 'driver'
      and p.is_verified = true
      and p.verification_status = 'approved'
  );
$$;

create or replace function public.taximun_driver_operation_message(p_driver_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when not exists (
      select 1 from public.taxi_user_profiles p where p.user_id = p_driver_id and p.role = 'driver'
    ) then 'Completa tu perfil profesional antes de ponerte online.'
    when exists (
      select 1 from public.taxi_user_profiles p where p.user_id = p_driver_id and p.role = 'driver' and p.verification_status = 'rejected'
    ) then 'Tu verificación fue rechazada. Revisa la nota del administrador y vuelve a enviar la documentación.'
    when exists (
      select 1 from public.taxi_user_profiles p where p.user_id = p_driver_id and p.role = 'driver' and p.verification_status = 'in_review'
    ) then 'Tu documentación está en revisión. Aún no puedes operar.'
    else 'Tu cuenta de conductor todavía no está verificada.'
  end;
$$;

grant execute on function public.taximun_driver_can_operate(text) to authenticated, service_role;
grant execute on function public.taximun_driver_operation_message(text) to authenticated, service_role;
