import type { SupabaseClient } from '@supabase/supabase-js'

export type ReportPeriod =
  | 'current_month' | 'last_month' | '90d' | '12m' | 'current_year'

export type ReportConfig = {
  id: string
  name: string
  recipient_whatsapp: string
  frequency: 'daily' | 'weekly' | 'monthly'
  send_time: string
  send_day: number | null
  indicators: string[]
  ward_ids: string[]
  period: ReportPeriod
  include_targets: boolean
  include_ranking: boolean
  is_active: boolean
}

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  current_month: 'Mês Atual',
  last_month: 'Mês Passado',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
  current_year: 'Ano Atual',
}

const RECOMENDACAO_SLUGS = [
  'recomendacao_templo_com_investidura',
  'recomendacao_templo_sem_investidura',
]

function getDateRange(period: ReportPeriod): { start: string; end: string } {
  const now = new Date()
  let start: Date, end: Date
  switch (period) {
    case 'current_month': start = new Date(now.getFullYear(), now.getMonth(), 1); end = now; break
    case 'last_month':    start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end = new Date(now.getFullYear(), now.getMonth(), 0); break
    case '90d':           start = new Date(now); start.setDate(start.getDate() - 90); end = now; break
    case '12m':           start = new Date(now); start.setFullYear(start.getFullYear() - 1); end = now; break
    case 'current_year':  start = new Date(now.getFullYear(), 0, 1); end = now; break
  }
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
}

function shortName(name: string): string {
  return name
    .replace('Recomendações para o Templo - Membros ', 'Rec. ')
    .replace('Frequência da Reunião ', 'Freq. ')
    .replace('Missionários Servindo do Brasil', 'Missionários')
    .replace('Membros Retornando à Igreja', 'Retornando')
    .replace('Membros Participantes', 'Participantes')
    .replace('Membros Jejuando', 'Jejuando')
    .replace('Batismos de Conversos', 'Batismos')
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

type RpcRow = {
  ward_id: string; ward_name: string; ward_membership: number | null
  indicator_id: string; display_name: string; slug: string
  indicator_type: string; aggregation_method: string
  responsibility: string; order_index: number; computed_value: number
}

export async function buildReportMessage(
  supabase: SupabaseClient,
  config: ReportConfig,
): Promise<string> {
  const { start, end } = getDateRange(config.period)
  const isLongPeriod = ['90d', '12m', 'current_year'].includes(config.period)

  // 1) Dados do RPC + contagem nominal de batismos (mesma lógica do dashboard)
  const [rpcRes, baptismByWardRes] = await Promise.all([
    supabase.rpc('get_dashboard_data_v2', { p_start: start, p_end: end }),
    supabase.from('baptism_records').select('ward_id').gte('week_start', start).lte('week_start', end),
  ])

  if (rpcRes.error) throw new Error(`RPC get_dashboard_data_v2: ${rpcRes.error.message}`)
  let rows: RpcRow[] = rpcRes.data || []

  // Override batismo nominal por ala
  if (baptismByWardRes.data) {
    const countByWard = new Map<string, number>()
    for (const b of baptismByWardRes.data as { ward_id: string }[]) {
      countByWard.set(b.ward_id, (countByWard.get(b.ward_id) || 0) + 1)
    }
    rows = rows.map(r =>
      r.slug === 'batismo_converso'
        ? { ...r, computed_value: countByWard.get(r.ward_id) || 0 }
        : r,
    )
  }

  // 2) Filtrar por alas selecionadas (vazio = estaca inteira)
  const filterByWards = config.ward_ids.length > 0
  const selectedWardSet = new Set(config.ward_ids)
  const filteredRows = filterByWards
    ? rows.filter(r => selectedWardSet.has(r.ward_id))
    : rows

  // Quais alas aparecem no relatório
  const wardMap = new Map<string, { id: string; name: string; membership: number | null }>()
  for (const r of filteredRows) {
    if (!wardMap.has(r.ward_id)) {
      wardMap.set(r.ward_id, { id: r.ward_id, name: r.ward_name, membership: r.ward_membership })
    }
  }
  const wards = Array.from(wardMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  // 3) Alvos (targets) — só se include_targets
  const targetMatrix: Record<string, Record<string, number>> = {}
  if (config.include_targets) {
    const { data: targetsData } = await supabase
      .from('indicator_targets')
      .select('indicator_id, ward_id, target_value')
    if (targetsData) {
      for (const t of targetsData as { indicator_id: string; ward_id: string; target_value: number }[]) {
        if (!targetMatrix[t.indicator_id]) targetMatrix[t.indicator_id] = {}
        targetMatrix[t.indicator_id][t.ward_id] = Number(t.target_value) || 0
      }
    }
  }

  // 4) Agrupar por indicador selecionado
  const byIndicator = new Map<string, RpcRow[]>()
  for (const row of filteredRows) {
    if (!config.indicators.includes(row.slug)) continue
    const arr = byIndicator.get(row.indicator_id) || []
    arr.push(row)
    byIndicator.set(row.indicator_id, arr)
  }

  // Ordenar indicadores pela order_index
  const indicatorOrder = Array.from(byIndicator.values())
    .map(rs => ({ id: rs[0].indicator_id, order: rs[0].order_index }))
    .sort((a, b) => a.order - b.order)

  // 5) Montar mensagem
  const lines: string[] = []
  lines.push(`📊 *${config.name}*`)
  lines.push(`📅 Período: ${PERIOD_LABELS[config.period]}`)
  lines.push(
    filterByWards
      ? `🏛️ Alas: ${wards.map(w => w.name).join(', ')}`
      : `🏛️ Estaca (${wards.length} alas)`,
  )
  lines.push('')
  lines.push('━━━━━━━━━━━━━━━')

  if (indicatorOrder.length === 0) {
    lines.push('')
    lines.push('⚠️ Nenhum indicador selecionado.')
  }

  for (const { id: indicatorId } of indicatorOrder) {
    const wardRows = byIndicator.get(indicatorId)!
    const first = wardRows[0]
    const slug = first.slug
    const isRecomendacao = RECOMENDACAO_SLUGS.includes(slug)
    const isAvg = first.aggregation_method === 'avg' || (isRecomendacao && isLongPeriod)

    const values = wardRows.map(r => r.computed_value)
    const total = values.reduce((s, v) => s + v, 0)
    const mainValue = isAvg ? total / values.length : total
    const valueLabel = isAvg ? 'Média' : 'Total'

    lines.push('')
    lines.push(`📈 *${shortName(first.display_name)}*`)
    lines.push(`   ${valueLabel}: ${fmt(mainValue)}`)

    // Targets: soma dos targets das alas selecionadas
    if (config.include_targets && targetMatrix[indicatorId]) {
      const selectedTargets = wardRows
        .map(r => targetMatrix[indicatorId][r.ward_id] || 0)
        .filter(t => t > 0)
      if (selectedTargets.length > 0) {
        const targetTotal = selectedTargets.reduce((s, v) => s + v, 0)
        const targetRef = isAvg ? targetTotal / selectedTargets.length : targetTotal
        const progress = targetRef > 0 ? (mainValue / targetRef) * 100 : 0
        lines.push(`   Meta: ${fmt(targetRef)}`)
        lines.push(`   Progresso: ${fmt(progress)}%`)
      }
    }

    // Ranking por ala
    if (config.include_ranking && wardRows.length > 1) {
      const ranked = [...wardRows].sort((a, b) => b.computed_value - a.computed_value)
      const best = ranked[0]
      const worst = ranked[ranked.length - 1]
      lines.push(`   🏆 Melhor: ${best.ward_name} (${fmt(best.computed_value)})`)
      lines.push(`   ⚠️ Atenção: ${worst.ward_name} (${fmt(worst.computed_value)})`)
    }
  }

  lines.push('')
  lines.push('━━━━━━━━━━━━━━━')
  lines.push('')
  const nowLabel = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  lines.push(`_Gerado em ${nowLabel}_`)
  lines.push('_Chamados a Servir_')

  return lines.join('\n')
}
