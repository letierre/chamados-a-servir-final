'use client'

import { useEffect, useState, useRef, ReactNode } from 'react'
import { createClient } from '../../lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, FileSpreadsheet, Loader2, TrendingUp,
  Trophy, AlertCircle, Building2, BarChart3, Users, Printer
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts'

/* ═══════════════════════════════════════ */
/* CONFIGURAÇÃO                           */
/* ═══════════════════════════════════════ */

const THEME = { primary: '#0069a8', textTitle: '#157493', bg: '#f1f5f9' }
const COLORS = ['#0069a8', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#f43f5e']

/* ═══════════════════════════════════════ */
/* TIPOS                                  */
/* ═══════════════════════════════════════ */

type RawRow = {
  ward_id: string; ward_name: string; ward_membership: number
  indicator_id: string; display_name: string; slug: string
  indicator_type: string; aggregation_method: string
  responsibility: string; order_index: number
  week_start: string; raw_value: number
}

type WardValue = { ward_id: string; ward_name: string; membership: number; value: number; score: number }

type IndicatorSummary = {
  indicator_id: string; display_name: string; slug: string
  aggregation_method: string; responsibility: string; order_index: number
  stakeTotal: number; byWard: WardValue[]
  best: { name: string; value: number }
  worst: { name: string; value: number }
}

type WeeklyPoint = { week: string; [wardName: string]: string | number }

type ProcessedData = {
  indicators: IndicatorSummary[]
  wards: { id: string; name: string; membership: number }[]
  weeks: string[]
  weeklyByIndicator: Record<string, WeeklyPoint[]>
}

/* ═══════════════════════════════════════ */
/* HELPERS                                */
/* ═══════════════════════════════════════ */

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function shortName(name: string) {
  return name
    .replace('Recomendações para o Templo - Membros ', 'Rec. ')
    .replace('Frequência da Reunião ', 'Freq. ')
    .replace('Missionários Servindo do Brasil', 'Missionários')
    .replace('Membros Retornando à Igreja', 'Retornando')
    .replace('Membros Participantes', 'Participantes')
    .replace('Membros Jejuando', 'Jejuando')
    .replace('Batismos de Conversos', 'Batismos')
}

function processData(raw: RawRow[]): ProcessedData {
  const wardMap = new Map<string, { id: string; name: string; membership: number }>()
  raw.forEach(r => wardMap.set(r.ward_id, { id: r.ward_id, name: r.ward_name, membership: r.ward_membership }))
  const wards = Array.from(wardMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  const weekSet = new Set<string>()
  raw.forEach(r => weekSet.add(r.week_start))
  const weeks = Array.from(weekSet).sort()

  const indMap = new Map<string, RawRow[]>()
  raw.forEach(r => {
    if (!indMap.has(r.indicator_id)) indMap.set(r.indicator_id, [])
    indMap.get(r.indicator_id)!.push(r)
  })

  const indicators: IndicatorSummary[] = []
  const weeklyByIndicator: Record<string, WeeklyPoint[]> = {}

  for (const [indId, rows] of indMap) {
    const first = rows[0]
    const method = first.aggregation_method

    const wardValues = new Map<string, { name: string; membership: number; values: number[] }>()
    rows.forEach(r => {
      if (!wardValues.has(r.ward_id))
        wardValues.set(r.ward_id, { name: r.ward_name, membership: r.ward_membership, values: [] })
      wardValues.get(r.ward_id)!.values.push(r.raw_value)
    })

    const byWard: WardValue[] = []
    for (const [wId, wData] of wardValues) {
      let value: number
      if (method === 'sum') value = wData.values.reduce((a, b) => a + b, 0)
      else if (method === 'avg') value = Math.round(wData.values.reduce((a, b) => a + b, 0) / wData.values.length)
      else value = wData.values[wData.values.length - 1]
      const score = wData.membership > 0 ? Math.round((value / wData.membership) * 1000) : 0
      byWard.push({ ward_id: wId, ward_name: wData.name, membership: wData.membership, value, score })
    }
    byWard.sort((a, b) => b.score - a.score)

    const stakeTotal = method === 'avg'
      ? Math.round(byWard.reduce((s, w) => s + w.value, 0) / Math.max(byWard.length, 1))
      : byWard.reduce((s, w) => s + w.value, 0)

    indicators.push({
      indicator_id: indId, display_name: first.display_name, slug: first.slug,
      aggregation_method: method, responsibility: first.responsibility, order_index: first.order_index,
      stakeTotal, byWard,
      best: byWard[0] ? { name: byWard[0].ward_name, value: byWard[0].value } : { name: '-', value: 0 },
      worst: byWard.length > 0 ? { name: byWard[byWard.length - 1].ward_name, value: byWard[byWard.length - 1].value } : { name: '-', value: 0 },
    })

    const weeklyPoints: WeeklyPoint[] = weeks.map(w => {
      const point: WeeklyPoint = { week: fmtDate(w) }
      for (const ward of wards) {
        const match = rows.find(r => r.ward_id === ward.id && r.week_start === w)
        point[ward.name] = match ? match.raw_value : 0
      }
      return point
    })
    weeklyByIndicator[indId] = weeklyPoints
  }

  indicators.sort((a, b) => a.order_index - b.order_index)
  return { indicators, wards, weeks, weeklyByIndicator }
}

// CORREÇÃO: Usando ponto e vírgula (;) e formatando a data para o Excel BR ler certinho
function exportCSV(raw: RawRow[]) {
  const header = 'Ala;Indicador;Tipo;Método;Responsabilidade;Semana;Valor;Membros\n'
  const rows = raw.map(r => {
    // Formata a data de "YYYY-MM-DD" para "DD/MM/YYYY" para ficar limpo no Excel
    const dataFormatada = new Date(r.week_start + 'T12:00:00').toLocaleDateString('pt-BR')
    return `"${r.ward_name}";"${r.display_name}";"${r.indicator_type}";"${r.aggregation_method}";"${r.responsibility}";"${dataFormatada}";${r.raw_value};${r.ward_membership}`
  }).join('\n')
  
  const bom = '\uFEFF'
  const blob = new Blob([bom + header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `relatorio-estaca-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ═══════════════════════════════════════ */
/* COMPONENTE PRINCIPAL                   */
/* ═══════════════════════════════════════ */

export default function RelatorioPage() {
  const supabase = createClient()
  const router = useRouter()
  const reportRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [rawData, setRawData] = useState<RawRow[]>([])
  const [data, setData] = useState<ProcessedData | null>(null)

  useEffect(() => {
    async function load() {
      const { data: session } = await supabase.auth.getSession()
      if (!session.session) { router.push('/login'); return }

      const start = new Date()
      start.setDate(start.getDate() - 30)

      const { data: rows } = await supabase.rpc('get_report_data', {
        p_start: start.toISOString().split('T')[0],
        p_end: new Date().toISOString().split('T')[0],
      })

      if (rows && rows.length > 0) {
        setRawData(rows)
        setData(processData(rows))
      }
      setLoading(false)
    }
    load()
  }, [supabase, router])

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: THEME.bg }}>
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: THEME.primary }} />
      </div>
    )
  }

  /* ─── SEM DADOS ─── */
  if (!data || data.indicators.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center flex-col gap-4" style={{ backgroundColor: THEME.bg }}>
        <AlertCircle size={48} className="text-slate-300" />
        <p className="text-slate-500 font-bold">Sem dados nos últimos 30 dias.</p>
        <button onClick={() => router.push('/dashboard')} className="text-sky-600 font-bold text-sm hover:underline">
          Voltar ao Dashboard
        </button>
      </div>
    )
  }

  const { indicators, wards, weeklyByIndicator } = data
  const reportDate = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalMembros = wards.reduce((s, w) => s + w.membership, 0)

  /* ═══════════════════════════════════════ */
  /* RENDER                                 */
  /* ═══════════════════════════════════════ */

  return (
    <>
      {/* ═══ BARRA DE AÇÕES (não imprime) ═══ */}
      <div className="print:hidden sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex items-center justify-between">
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors">
            <ArrowLeft size={18} /> Dashboard
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => exportCSV(rawData)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-100 hover:bg-emerald-100 transition-all">
              <FileSpreadsheet size={16} /> CSV
            </button>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-5 py-2.5 text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-xl transition-all"
              style={{ backgroundColor: THEME.primary }}>
              <Printer size={16} /> Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      {/* ═══ CONTEÚDO DO RELATÓRIO ═══ */}
      <main ref={reportRef} className="min-h-screen p-4 md:p-8 print:p-2" style={{ backgroundColor: THEME.bg }}>
        <div className="max-w-7xl mx-auto space-y-8 print:space-y-4">

          {/* ───────────────────────────────── */}
          {/* CAPA / HEADER                    */}
          {/* ───────────────────────────────── */}
          <section className="bg-white rounded-3xl print:rounded-lg shadow-xl print:shadow border border-slate-200 overflow-hidden">
            <div className="h-3 w-full" style={{ backgroundColor: THEME.primary }} />
            <div className="p-8 md:p-12 print:p-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Relatório de Desempenho
                  </p>
                  <h1 className="text-3xl md:text-4xl print:text-2xl font-black tracking-tight" style={{ color: THEME.textTitle }}>
                    Estaca Santa Cruz do Sul
                  </h1>
                  <p className="text-slate-500 font-bold text-sm mt-2">
                    Últimos 30 dias — Gerado em {reportDate}
                  </p>
                </div>
                <div className="flex gap-4 text-center">
                  {[
                    { val: wards.length, label: 'Unidades' },
                    { val: indicators.length, label: 'Indicadores' },
                    { val: totalMembros.toLocaleString('pt-BR'), label: 'Membros' },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 min-w-[5rem]">
                      <p className="text-2xl font-black text-slate-800">{s.val}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ───────────────────────────────── */}
          {/* SEÇÃO 1: RESUMO GERAL            */}
          {/* ───────────────────────────────── */}
          <section className="bg-white rounded-3xl print:rounded-lg shadow-xl print:shadow border border-slate-200 p-6 md:p-10 print:p-5">
            <SectionHeader icon={<BarChart3 size={22} style={{ color: THEME.primary }} />}
              bgColor={THEME.primary + '15'}
              title="Visão Geral da Estaca" subtitle="Totais consolidados" />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:gap-3">
              {indicators.map(ind => (
                <div key={ind.indicator_id} className="bg-slate-50 rounded-2xl print:rounded-lg p-5 print:p-3 border border-slate-100">
                  <p className="text-[10px] print:text-[8px] font-black text-slate-400 uppercase tracking-wider leading-tight mb-3 min-h-[2rem] print:min-h-0">
                    {shortName(ind.display_name)}
                  </p>
                  <p className="text-3xl print:text-xl font-black text-slate-800">
                    {ind.stakeTotal.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    {ind.aggregation_method === 'avg' ? 'Média' : ind.aggregation_method === 'sum' ? 'Total' : 'Atual'}
                  </p>
                  <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-emerald-600 uppercase">Destaque</p>
                      <p className="text-[10px] font-bold text-slate-600 truncate">{ind.best.name.replace('Ala ', '').replace('Ramo ', '')}</p>
                      <p className="text-xs font-black text-emerald-700">{ind.best.value}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-rose-500 uppercase">Atenção</p>
                      <p className="text-[10px] font-bold text-slate-600 truncate">{ind.worst.name.replace('Ala ', '').replace('Ramo ', '')}</p>
                      <p className="text-xs font-black text-rose-600">{ind.worst.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ───────────────────────────────── */}
          {/* SEÇÃO 2: RANKING COMPARATIVO     */}
          {/* ───────────────────────────────── */}
          <section className="bg-white rounded-3xl print:rounded-lg shadow-xl print:shadow border border-slate-200 p-6 md:p-10 print:p-5 print:break-before-page">
            <SectionHeader icon={<Trophy size={22} className="text-amber-600" />}
              bgColor="#fef3c7" title="Ranking Comparativo"
              subtitle="Score normalizado por membros (valor ÷ membros × 1000)" />

            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm print:text-[9px]">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="text-left p-3 print:p-1.5 text-[10px] print:text-[8px] font-black text-slate-400 uppercase">Unidade</th>
                    <th className="text-center p-3 print:p-1.5 text-[10px] print:text-[8px] font-black text-slate-400 uppercase">Membros</th>
                    {indicators.map(ind => (
                      <th key={ind.indicator_id} className="text-center p-3 print:p-1.5 text-[10px] print:text-[7px] font-black text-slate-400 uppercase max-w-[5rem]">
                        <span className="block truncate">{shortName(ind.display_name)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {wards.map(ward => (
                    <tr key={ward.id} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                      <td className="p-3 print:p-1.5">
                        <span className="font-bold text-slate-700">{ward.name}</span>
                      </td>
                      <td className="p-3 print:p-1.5 text-center">
                        <span className="text-xs font-bold text-slate-400">{ward.membership}</span>
                      </td>
                      {indicators.map(ind => {
                        const wardData = ind.byWard.find(w => w.ward_id === ward.id)
                        const rank = ind.byWard.findIndex(w => w.ward_id === ward.id)
                        const isFirst = rank === 0
                        const isLast = rank === ind.byWard.length - 1
                        return (
                          <td key={ind.indicator_id} className="p-3 print:p-1.5 text-center">
                            <span className={`inline-block px-2 py-1 rounded-lg text-xs print:text-[9px] font-black ${
                              isFirst ? 'bg-emerald-50 text-emerald-700' :
                              isLast ? 'bg-rose-50 text-rose-600' : 'text-slate-700'
                            }`}>
                              {wardData?.value ?? '-'}
                            </span>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                    <td className="p-3 print:p-1.5 font-black text-slate-800" colSpan={2}>ESTACA</td>
                    {indicators.map(ind => (
                      <td key={ind.indicator_id} className="p-3 print:p-1.5 text-center">
                        <span className="font-black text-slate-800">{ind.stakeTotal.toLocaleString('pt-BR')}</span>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ───────────────────────────────── */}
          {/* SEÇÃO 3: GRÁFICOS DE EVOLUÇÃO    */}
          {/* ───────────────────────────────── */}
          <section className="bg-white rounded-3xl print:rounded-lg shadow-xl print:shadow border border-slate-200 p-6 md:p-10 print:p-5 print:break-before-page">
            <SectionHeader icon={<TrendingUp size={22} className="text-sky-600" />}
              bgColor="#e0f2fe" title="Evolução Semanal"
              subtitle="Desempenho por semana (últimos 30 dias)" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-4">
              {indicators.filter(ind => ind.aggregation_method !== 'last').map(ind => {
                const chartData = weeklyByIndicator[ind.indicator_id] || []
                if (chartData.length === 0) return null
                return (
                  <div key={ind.indicator_id} className="space-y-3">
                    <h3 className="text-sm font-black text-slate-700">{ind.display_name}</h3>
                    <div className="h-56 print:h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                            labelStyle={{ fontWeight: 800, marginBottom: '4px' }} />
                          {wards.map((ward, i) => (
                            <Line key={ward.id} type="monotone" dataKey={ward.name}
                              stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legenda */}
            <div className="mt-6 flex flex-wrap gap-3 justify-center print:gap-2">
              {wards.map((ward, i) => (
                <div key={ward.id} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[10px] font-bold text-slate-500">{ward.name}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ───────────────────────────────── */}
          {/* SEÇÃO 4: DETALHAMENTO POR ALA    */}
          {/* ───────────────────────────────── */}
          {wards.map((ward, wIdx) => (
            <section key={ward.id}
              className="bg-white rounded-3xl print:rounded-lg shadow-xl print:shadow border border-slate-200 p-6 md:p-10 print:p-5 print:break-before-page">
              <div className="flex items-center gap-3 mb-8 print:mb-4">
                <div className="p-2.5 rounded-xl" style={{ backgroundColor: COLORS[wIdx % COLORS.length] + '20' }}>
                  <Building2 size={22} style={{ color: COLORS[wIdx % COLORS.length] }} />
                </div>
                <div>
                  <h2 className="text-xl print:text-base font-black text-slate-800">{ward.name}</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1">
                    <Users size={12} /> {ward.membership} membros
                  </p>
                </div>
              </div>

              {/* Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:gap-2 mb-8 print:mb-4">
                {indicators.map(ind => {
                  const wardData = ind.byWard.find(w => w.ward_id === ward.id)
                  const rank = ind.byWard.findIndex(w => w.ward_id === ward.id) + 1
                  const total = ind.byWard.length
                  const top = rank <= Math.ceil(total / 3)
                  const bottom = rank > total - Math.ceil(total / 3)
                  return (
                    <div key={ind.indicator_id} className="bg-slate-50 rounded-xl print:rounded-lg p-4 print:p-2.5 border border-slate-100">
                      <p className="text-[9px] print:text-[7px] font-black text-slate-400 uppercase tracking-wider leading-tight mb-2">
                        {shortName(ind.display_name)}
                      </p>
                      <p className="text-2xl print:text-lg font-black text-slate-800">{wardData?.value ?? 0}</p>
                      <span className={`inline-block mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        top ? 'text-emerald-600 bg-emerald-50' :
                        bottom ? 'text-rose-600 bg-rose-50' :
                        'text-slate-500 bg-slate-100'
                      }`}>
                        #{rank} de {total}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Gráfico de barras */}
              <div className="h-52 print:h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={indicators.map(ind => ({
                      name: shortName(ind.display_name),
                      valor: ind.byWard.find(w => w.ward_id === ward.id)?.value ?? 0,
                    }))}
                    margin={{ top: 5, right: 5, left: -20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '11px' }} />
                    <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                      {indicators.map((_, i) => (
                        <Cell key={i} fill={COLORS[wIdx % COLORS.length]} opacity={0.6 + (i % 4) * 0.1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          ))}

          {/* FOOTER */}
          <p className="text-center text-[10px] text-slate-300 font-bold py-6 uppercase tracking-widest">
            Chamados a Servir — Relatório gerado automaticamente — v1.4.0
          </p>
        </div>
      </main>

      {/* CORREÇÃO 2: Estilo de impressão ajustado para desbloquear o scroll (height: auto) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          html, body, main {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page { margin: 1cm; size: A4 landscape; }
          
          /* Evita que blocos importantes sejam divididos no meio da impressão */
          section {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}} />
    </>
  )
}

/* ═══════════════════════════════════════ */
/* COMPONENTE AUXILIAR                    */
/* ═══════════════════════════════════════ */

function SectionHeader({ icon, bgColor, title, subtitle }: {
  icon: ReactNode; bgColor: string; title: string; subtitle: string
}) {
  return (
    <div className="flex items-center gap-3 mb-8 print:mb-4">
      <div className="p-2.5 rounded-xl" style={{ backgroundColor: bgColor }}>{icon}</div>
      <div>
        <h2 className="text-xl print:text-base font-black text-slate-800">{title}</h2>
        <p className="text-xs print:text-[9px] font-bold text-slate-400 uppercase">{subtitle}</p>
      </div>
    </div>
  )
}