-- Taximun production health audit
-- Read-only diagnostic for administrators.

create or replace function public.taximun_system_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  required_tables text[] := array[
    'taxi_rides','driver_live_status','taxi_ride_offers','taxi_trip_messages',
    'taxi_trip_call_requests','taxi_trip_audio_rooms','taxi_trip_audio_signals',
    'taxi_trip_audio_quality_metrics','taxi_safety_reports','taxi_notifications',
    'taxi_ride_ratings','taxi_driver_documents','taxi_activity_logs'
  ];
  required_functions text[] := array[
    'taximun_find_pending_rides_for_driver','taximun_accept_ride_transactional',
    'taximun_dispatch_health','taximun_reconcile_dispatch_state','taximun_notify_admins'
  ];
  table_items jsonb := '[]'::jsonb;
  function_items jsonb := '[]'::jsonb;
  rls_items jsonb := '[]'::jsonb;
  item text;
  present boolean;
  rls_enabled boolean;
begin
  if not exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  foreach item in array required_tables loop
    present := to_regclass('public.' || item) is not null;
    table_items := table_items || jsonb_build_array(jsonb_build_object(
      'name', item,
      'ok', present,
      'severity', case when present then 'ok' else 'error' end,
      'message', case when present then 'Tabla disponible' else 'Falta tabla o migración' end
    ));

    if present then
      select c.relrowsecurity into rls_enabled
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = item;
      rls_items := rls_items || jsonb_build_array(jsonb_build_object(
        'name', item,
        'ok', coalesce(rls_enabled,false),
        'severity', case when coalesce(rls_enabled,false) then 'ok' else 'warning' end,
        'message', case when coalesce(rls_enabled,false) then 'RLS activada' else 'RLS no activada' end
      ));
    end if;
  end loop;

  foreach item in array required_functions loop
    select exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = item
    ) into present;
    function_items := function_items || jsonb_build_array(jsonb_build_object(
      'name', item,
      'ok', present,
      'severity', case when present then 'ok' else 'error' end,
      'message', case when present then 'Función disponible' else 'Falta función RPC' end
    ));
  end loop;

  return jsonb_build_object(
    'checkedAt', now(),
    'database', jsonb_build_object('ok', true, 'message', 'Conexión Supabase operativa'),
    'tables', table_items,
    'functions', function_items,
    'rls', rls_items,
    'summary', jsonb_build_object(
      'tablesOk', (select count(*) from jsonb_array_elements(table_items) x where (x->>'ok')::boolean),
      'tablesTotal', jsonb_array_length(table_items),
      'functionsOk', (select count(*) from jsonb_array_elements(function_items) x where (x->>'ok')::boolean),
      'functionsTotal', jsonb_array_length(function_items),
      'rlsOk', (select count(*) from jsonb_array_elements(rls_items) x where (x->>'ok')::boolean),
      'rlsTotal', jsonb_array_length(rls_items)
    )
  );
end;
$$;

revoke all on function public.taximun_system_health() from public;
grant execute on function public.taximun_system_health() to authenticated;
