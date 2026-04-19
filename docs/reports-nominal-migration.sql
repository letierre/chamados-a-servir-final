-- ═══════════════════════════════════════════════════════════
-- MIGRAÇÃO — RELATÓRIOS NOMINAIS (lista de nomes com filtros)
-- Rode no SQL Editor do Supabase APÓS o reports-setup.sql.
-- ═══════════════════════════════════════════════════════════

-- Tipo do relatório: resumo de indicadores (padrão) ou lista nominal
alter table public.report_configs
  add column if not exists report_type text not null default 'summary'
  check (report_type in ('summary', 'nominal'));

-- Qual fonte nominal usar (só faz sentido quando report_type = 'nominal')
alter table public.report_configs
  add column if not exists nominal_source text
  check (nominal_source is null or nominal_source in ('baptism', 'returning', 'missionary'));

-- Filtros de idade (só aplicáveis a baptism e returning — missionary não tem birth_date)
alter table public.report_configs add column if not exists age_min int;
alter table public.report_configs add column if not exists age_max int;

-- Filtro de gênero: 'all' | 'M' | 'F'
alter table public.report_configs
  add column if not exists gender_filter text not null default 'all'
  check (gender_filter in ('all', 'M', 'F'));
