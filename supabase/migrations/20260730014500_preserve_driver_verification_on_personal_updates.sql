-- PR #127 · Preserve driver verification when only personal fields change

create or replace function public.taximun_preserve_driver_verification_on_personal_update()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if tg_op <> 'UPDATE' or old.role <> 'driver' or new.role <> 'driver' then
    return new;
  end if;

  if new.driver_license_number is not distinct from old.driver_license_number
     and new.taxi_code is not distinct from old.taxi_code
     and new.plate is not distinct from old.plate
     and new.vehicle_model is not distinct from old.vehicle_model
     and new.work_zone is not distinct from old.work_zone then
    new.verification_status := old.verification_status;
    new.is_verified := old.is_verified;
    new.verification_note := old.verification_note;
    new.verified_by := old.verified_by;
    new.verified_at := old.verified_at;
  end if;

  return new;
end;
$$;

drop trigger if exists taximun_preserve_driver_verification_personal_update
on public.taxi_user_profiles;

create trigger taximun_preserve_driver_verification_personal_update
before update on public.taxi_user_profiles
for each row
execute function public.taximun_preserve_driver_verification_on_personal_update();
