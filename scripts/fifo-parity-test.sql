-- Prueba funcional del parche FIFO + salida atómica (BD local fifo_test)
begin;

delete from taxi_ride_offers where ride_id in (select id from taxi_rides where passenger_id like 'test-%');
delete from taxi_dispatch_decisions where ride_id in (select id from taxi_rides where passenger_id like 'test-%');
delete from taxi_rides where passenger_id like 'test-%';
delete from driver_queues where driver_id in ('Q1','Q2');
delete from driver_live_status where driver_id in ('Q1','Q2','NEAR','CLOSE');
delete from taxi_user_profiles where user_id in ('Q1','Q2','CLOSE');

insert into taxi_user_profiles (user_id, role, full_name, is_verified, verification_status) values
  ('Q1', 'driver', 'Cola Uno', true, 'approved'),
  ('Q2', 'driver', 'Cola Dos', true, 'approved'),
  ('CLOSE', 'driver', 'Cerca No Cola', true, 'approved');

insert into driver_live_status (driver_id, driver_name, taxi_code, plate, status, current_lat, current_lng, current_zone, location_updated_at)
values
  ('Q1',    'Cola Uno',      'TX-1', 'B-1', 'available', 41.3000, 2.0830, 'Aeroport T1', now()),
  ('Q2',    'Cola Dos',      'TX-2', 'B-2', 'available', 41.2980, 2.0900, 'Aeroport T1', now()),
  ('NEAR',  'Cerca No Cola', 'TX-3', 'B-3', 'available', 41.29745, 2.08331, 'Aeroport T1', now());

insert into driver_queues (driver_id, zone_id, position, joined_at) values
  ('Q1', 'bcn-airport-t1', 1, now() - interval '10 minutes'),
  ('Q2', 'bcn-airport-t1', 2, now() - interval '5 minutes');

insert into taxi_rides (passenger_id, passenger_name, pickup_address, dropoff_address,
                        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status,
                        quote_version, quoted_at, fare_subtotal)
values ('test-p1', 'Test', 'Aeroport T1', 'Sagrada Família', 41.2974, 2.0833, 41.4036, 2.1744,
        'pending', 'v1-test', now(), 30.00);

-- ── Test 1: FIFO gana a la distancia ──
select taximun_server_dispatch((select id from taxi_rides where passenger_id='test-p1'), 30);
do $$ begin
  if not exists (select 1 from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
                 where r.passenger_id = 'test-p1' and o.driver_id = 'Q1' and o.status = 'pending') then
    raise exception 'TEST1 FALLO: esperaba oferta PENDING para Q1';
  end if;
end $$;
\echo ✓ TEST1: la oferta va a Q1 (cabeza de cola) y no al más cercano

-- ── Test 2: expira Q1 → avanza a Q2, sin re-ofertar a Q1 ──
update taxi_ride_offers set status = 'expired', expires_at = now()
where driver_id = 'Q1' and ride_id = (select id from taxi_rides where passenger_id='test-p1');
select taximun_server_dispatch((select id from taxi_rides where passenger_id='test-p1'), 30);
do $$ begin
  if not exists (select 1 from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
                 where r.passenger_id = 'test-p1' and o.driver_id = 'Q2' and o.status = 'pending') then
    raise exception 'TEST2 FALLO: esperaba oferta PENDING para Q2 tras expirar la de Q1';
  end if;
end $$;
\echo ✓ TEST2: sin bucle sobre Q1; la oferta avanza a Q2

-- ── Test 3: sin más cola → el más cercano ──
update taxi_ride_offers set status = 'expired', expires_at = now()
where driver_id = 'Q2' and ride_id = (select id from taxi_rides where passenger_id='test-p1');
select taximun_server_dispatch((select id from taxi_rides where passenger_id='test-p1'), 30);
do $$ begin
  if not exists (select 1 from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
                 where r.passenger_id = 'test-p1' and o.driver_id = 'NEAR' and o.status = 'pending') then
    raise exception 'TEST3 FALLO: esperaba oferta PENDING para NEAR';
  end if;
end $$;
\echo ✓ TEST3: agotada la cola, oferta al más cercano (NEAR)

-- ── Test 4: NEAR acepta; Q1/Q2 siguen en cola ──
select taximun_accept_smart_offer(
  (select o.id from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
   where r.passenger_id = 'test-p1' and o.driver_id = 'NEAR' and o.status = 'pending'),
  'NEAR', 'Cerca No Cola', 'TX-3', 'B-3');
do $$ begin
  if not exists (select 1 from taxi_rides where passenger_id = 'test-p1' and status = 'assigned' and driver_id = 'NEAR') then
    raise exception 'TEST4a FALLO: viaje no assigned a NEAR';
  end if;
  if not (exists (select 1 from driver_queues where driver_id = 'Q1' and is_active)
      and exists (select 1 from driver_queues where driver_id = 'Q2' and is_active)) then
    raise exception 'TEST4b FALLO: Q1/Q2 no deberían salir de la cola';
  end if;
end $$;
\echo ✓ TEST4: NEAR acepta y Q1/Q2 conservan su puesto en cola

-- ── Test 5: Q1 acepta → sale de la cola AL INSTANTE ──
insert into taxi_rides (passenger_id, passenger_name, pickup_address, dropoff_address,
                        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status,
                        quote_version, quoted_at, fare_subtotal)
values ('test-p2', 'Test', 'Aeroport T1', 'Plaça Catalunya', 41.2974, 2.0833, 41.3870, 2.1700,
        'pending', 'v1-test', now(), 25.00);
select taximun_server_dispatch((select id from taxi_rides where passenger_id='test-p2'), 30);
select taximun_accept_smart_offer(
  (select o.id from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
   where r.passenger_id = 'test-p2' and o.driver_id = 'Q1' and o.status = 'pending'),
  'Q1', 'Cola Uno', 'TX-1', 'B-1');
do $$ begin
  if exists (select 1 from driver_queues where driver_id = 'Q1' and is_active) then
    raise exception 'TEST5 FALLO: Q1 sigue en cola tras aceptar';
  end if;
  if not exists (select 1 from taxi_rides where passenger_id = 'test-p2' and status = 'assigned' and driver_id = 'Q1') then
    raise exception 'TEST5b FALLO: viaje no assigned a Q1';
  end if;
end $$;
\echo ✓ TEST5: accept_smart_offer saca a Q1 de la cola atómicamente

-- ── Test 6: el parche de salida de cola está en accept_ride_transactional ──
-- (la ruta transaccional sin oferta está bloqueada a propósito por el trigger
--  enforce_smart_offer_assignment; se verifica que la función lleve el parche)
do $$ begin
  if position('driver_queues' in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'taximun_accept_ride_transactional')) = 0 then
    raise exception 'TEST6 FALLO: accept_ride_transactional no contiene la salida de cola';
  end if;
  if position('driver_queues' in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'taximun_accept_smart_offer')) = 0 then
    raise exception 'TEST6b FALLO: accept_smart_offer no contiene la salida de cola';
  end if;
end $$;
\echo ✓ TEST6: ambos carries llevan el parche de salida de cola

-- ── Test 7: claim (fallback) respeta FIFO ──
update taxi_rides set status = 'in_progress', driver_arrived_at = now(), pin_verified_at = now(), started_at = now() where passenger_id = 'test-p2';
update taxi_rides set status = 'completed', final_fare = 25, payment_status = 'paid', settled_at = now(), settled_by = 'test-settle', completed_at = now() where passenger_id = 'test-p2';  -- libera a Q1
update driver_live_status set status = 'available', location_updated_at = now(), updated_at = now() where driver_id = 'Q1';
insert into driver_queues (driver_id, zone_id, position, joined_at)
values ('Q1', 'bcn-airport-t1', 1, now() - interval '1 minute');
insert into taxi_rides (passenger_id, passenger_name, pickup_address, dropoff_address,
                        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status,
                        quote_version, quoted_at, fare_subtotal)
values ('test-p4', 'Test', 'Aeroport T1', 'Born', 41.2974, 2.0833, 41.3850, 2.1820,
        'pending', 'v1-test', now(), 20.00);

select taximun_claim_smart_offer('CLOSE') as close_claim;   -- debe ser NULL
do $$ begin
  if exists (select 1 from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
             where r.passenger_id = 'test-p4' and o.driver_id = 'CLOSE') then
    raise exception 'TEST7a FALLO: CLOSE recibió oferta pese a que Q1 (cola) es el mejor';
  end if;
end $$;
select taximun_claim_smart_offer('Q1') as q1_claim;         -- debe crear la oferta
do $$ begin
  if not exists (select 1 from taxi_ride_offers o join taxi_rides r on r.id = o.ride_id
                 where r.passenger_id = 'test-p4' and o.driver_id = 'Q1' and o.status = 'pending') then
    raise exception 'TEST7b FALLO: Q1 no recibió la oferta del viaje pendiente';
  end if;
end $$;
\echo ✓ TEST7: claim respeta FIFO (Q1 en cola recibe; CLOSE más cerca, no)

rollback;
