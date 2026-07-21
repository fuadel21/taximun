-- PR #69 · Stripe webhook audit and idempotency

create table if not exists public.taxi_stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  api_version text,
  livemode boolean not null default false,
  payload jsonb not null,
  status text not null default 'received',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint taxi_stripe_webhook_events_status_check
    check (status in ('received','processing','processed','failed')),
  constraint taxi_stripe_webhook_events_attempts_check
    check (attempts >= 0)
);

create index if not exists taxi_stripe_webhook_events_type_idx
  on public.taxi_stripe_webhook_events(event_type, received_at desc);

create index if not exists taxi_stripe_webhook_events_status_idx
  on public.taxi_stripe_webhook_events(status, received_at desc);

alter table public.taxi_stripe_webhook_events enable row level security;
alter table public.taxi_stripe_webhook_events force row level security;

revoke all on public.taxi_stripe_webhook_events from anon, authenticated;
grant all on public.taxi_stripe_webhook_events to service_role;

create or replace function public.taximun_touch_stripe_webhook_event()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists taxi_stripe_webhook_events_touch
  on public.taxi_stripe_webhook_events;

create trigger taxi_stripe_webhook_events_touch
before update on public.taxi_stripe_webhook_events
for each row execute function public.taximun_touch_stripe_webhook_event();
