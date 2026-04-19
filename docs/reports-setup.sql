-- ═══════════════════════════════════════════════════════════
-- MÓDULO DE RELATÓRIOS VIA WHATSAPP (UazAPI)
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create table if not exists public.report_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  recipient_whatsapp text not null,                      -- número com DDI, ex: 5551999990000
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  send_time text not null,                               -- 'HH:MM' (fuso America/Sao_Paulo)
  send_day int,                                          -- 0-6 (dom-sáb) p/ weekly ou 1-31 p/ monthly
  indicators text[] not null default '{}',               -- slugs (ex: ['batismo_converso', 'frequencia_sacramental'])
  ward_ids uuid[] not null default '{}',                 -- vazio = estaca (soma de todas as alas)
  period text not null default '90d',                    -- 'current_month' | 'last_month' | '90d' | '12m' | 'current_year'
  include_targets boolean not null default true,
  include_ranking boolean not null default true,
  is_active boolean not null default true,
  last_sent_at timestamptz,
  last_send_status text,                                 -- 'ok' | 'error:<msg>'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_report_configs_active on public.report_configs(is_active);

-- Trigger para manter updated_at em dia
create or replace function public.report_configs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_report_configs_updated_at on public.report_configs;
create trigger trg_report_configs_updated_at
before update on public.report_configs
for each row execute function public.report_configs_set_updated_at();

-- RLS: usuários autenticados podem tudo (single-tenant)
alter table public.report_configs enable row level security;

drop policy if exists "report_configs_authenticated_all" on public.report_configs;
create policy "report_configs_authenticated_all"
on public.report_configs
for all
to authenticated
using (true)
with check (true);
