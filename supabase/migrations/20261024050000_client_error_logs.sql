-- Fase 6 · Monitorización propia: registro de errores del navegador
-- (window.onerror / unhandledrejection) visible en /admin/health.
create table if not exists public.client_error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  user_role text,
  message text not null,
  stack text,
  source_url text,
  user_agent text,
  occurred_at timestamptz not null default now(),
  resolved boolean not null default false
);

create index if not exists client_error_logs_occurred_idx on public.client_error_logs(occurred_at desc);
create index if not exists client_error_logs_unresolved_idx on public.client_error_logs(resolved) where resolved = false;

alter table public.client_error_logs enable row level security;

-- Escritura y lectura solo vía service_role (tRPC autenticado / admin).
grant select on public.client_error_logs to authenticated;
