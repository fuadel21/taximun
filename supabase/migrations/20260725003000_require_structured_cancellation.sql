-- Require structured provenance for every new cancellation.
-- Historical rows may keep legacy_unspecified, but new transitions cannot create it.

create or replace function public.taximun_fill_cancellation_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    new.cancelled_at := coalesce(new.cancelled_at, now());
    new.cancellation_note := nullif(trim(coalesce(new.cancellation_note, '')), '');

    if new.cancelled_by_role not in ('passenger', 'driver', 'admin', 'system') then
      raise exception 'CANCELLATION_REQUIRES_ACTOR_ROLE';
    end if;

    if nullif(trim(coalesce(new.cancelled_by_id, '')), '') is null then
      raise exception 'CANCELLATION_REQUIRES_ACTOR_ID';
    end if;

    if new.cancellation_reason is null
      or new.cancellation_reason = 'legacy_unspecified'
    then
      raise exception 'CANCELLATION_REQUIRES_STRUCTURED_REASON';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.taximun_fill_cancellation_provenance() is
  'Requires actor and structured reason for every new ride cancellation while preserving historical legacy rows.';
