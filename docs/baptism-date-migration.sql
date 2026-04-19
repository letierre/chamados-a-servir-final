-- ═══════════════════════════════════════════════════════════
-- MIGRAÇÃO — data real do batismo por pessoa
-- Rode no SQL Editor do Supabase.
-- ═══════════════════════════════════════════════════════════

-- 1) Nova coluna: data real do batismo (pode ser diferente do week_start)
alter table public.baptism_records
  add column if not exists baptism_date date;

-- 2) Backfill: onde estiver nulo, assumir week_start (assim registros antigos
--    continuam contando no dashboard e nos relatórios).
update public.baptism_records
set baptism_date = week_start
where baptism_date is null;

-- 3) Torna obrigatória a partir de agora
alter table public.baptism_records
  alter column baptism_date set not null;

-- 4) Índice para os filtros por data no dashboard/relatórios
create index if not exists idx_baptism_records_baptism_date
  on public.baptism_records(baptism_date);

-- 5) Atualiza a RPC get_baptism_names para devolver baptism_date ao formulário
--    (o módulo de lançamentos usa esse retorno para pré-preencher os campos).
drop function if exists public.get_baptism_names(uuid, date);
create or replace function public.get_baptism_names(
  p_ward_id uuid,
  p_week_start date
)
returns table (
  person_name text,
  birth_date date,
  gender text,
  baptism_date date
)
language sql
security definer
set search_path = public
as $$
  select person_name, birth_date, gender, baptism_date
  from public.baptism_records
  where ward_id = p_ward_id
    and week_start = p_week_start
  order by person_name;
$$;

grant execute on function public.get_baptism_names(uuid, date) to authenticated;
