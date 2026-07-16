-- Secure in-app communication between passenger and assigned driver.

create table if not exists public.taxi_ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.taxi_rides(id) on delete cascade,
  sender_id text not null,
  sender_role text not null check (sender_role in ('passenger','driver','admin')),
  recipient_id text not null,
  message_type text not null default 'text' check (message_type in ('text','quick')),
  body text not null check (char_length(body) between 1 and 600),
  quick_code text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists taxi_ride_messages_ride_created_idx
  on public.taxi_ride_messages(ride_id, created_at asc);

create index if not exists taxi_ride_messages_recipient_unread_idx
  on public.taxi_ride_messages(recipient_id, read_at, created_at desc);

alter table public.taxi_ride_messages enable row level security;

drop policy if exists taxi_ride_messages_participants_select on public.taxi_ride_messages;
create policy taxi_ride_messages_participants_select
  on public.taxi_ride_messages
  for select
  to authenticated
  using (
    sender_id = 'supabase:' || auth.uid()::text
    or recipient_id = 'supabase:' || auth.uid()::text
    or exists (
      select 1 from public.taxi_user_profiles p
      where p.user_id = 'supabase:' || auth.uid()::text
        and p.role = 'admin'
    )
  );

drop policy if exists taxi_ride_messages_participants_insert on public.taxi_ride_messages;
create policy taxi_ride_messages_participants_insert
  on public.taxi_ride_messages
  for insert
  to authenticated
  with check (
    sender_id = 'supabase:' || auth.uid()::text
    and exists (
      select 1 from public.taxi_rides r
      where r.id = taxi_ride_messages.ride_id
        and r.status in ('assigned','in_progress')
        and (
          r.passenger_id = taxi_ride_messages.sender_id
          or r.driver_id = taxi_ride_messages.sender_id
        )
        and (
          r.passenger_id = taxi_ride_messages.recipient_id
          or r.driver_id = taxi_ride_messages.recipient_id
        )
    )
  );

grant select, insert, update on public.taxi_ride_messages to authenticated;
grant all on public.taxi_ride_messages to service_role;
