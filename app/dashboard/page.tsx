'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '../../lib/supabase/client'
import { useRouter } from 'next/navigation'
import { 
  Users, UserPlus, Heart, Church, 
  Award, BookOpen, Target,
  Trophy, AlertCircle,
  Search, BarChart3,
  FileText, FileSpreadsheet,
  TrendingUp, Printer, Bot, Sparkles, Loader2
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

// ═══════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════

type Period = 'current_month' | 'last_month' | '90d' | '12m'

type Ward = {
  id: string
  name: string
  membership_count: number | null
}

type Indicator = {
  id: string
  slug: string
  display_name: string
  order_index: number
}

type RpcRow = {
  ward_id: string
  ward_name: string
  ward_membership: number | null
  indicator_id: string
  display_name: string
  slug: string
  indicator_type: string
  aggregation_method: string
  responsibility: string
  order_index: number
  computed_value: number
}

type CardData = {
  id: string
  slug: string
  display_name: string
  value: number
  subtitle: string
  bestWard: string
  bestValue: number
  worstWard: string
  worstValue: number
}

type WardMetric = {
  id: string
  slug: string
  display_name: string
  value: number
  target: number
  gap: number
  progress: number
}

// ═══════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════

const COLORS = {
  title: '#0e4f66',
  chartLine: '#0ea5e9'
}

const ICON_MAP: Record<string, React.ReactNode> = {
  frequencia_sacramental: <Church className="w-4 h-4 md:w-6 md:h-6 text-sky-600" />,
  batismo_converso: <UserPlus className="w-4 h-4 md:w-6 md:h-6 text-emerald-600" />,
  membros_retornando_a_igreja: <Users className="w-4 h-4 md:w-6 md:h-6 text-orange-600" />,
  membros_participantes: <Users className="w-4 h-4 md:w-6 md:h-6 text-blue-600" />,
  membros_jejuando: <Heart className="w-4 h-4 md:w-6 md:h-6 text-rose-600" />,
  missionario_servindo_missao_do_brasil: <BookOpen className="w-4 h-4 md:w-6 md:h-6 text-indigo-600" />,
  recomendacao_templo_com_investidura: <Award className="w-4 h-4 md:w-6 md:h-6 text-amber-600" />,
  recomendacao_templo_sem_investidura: <Award className="w-4 h-4 md:w-6 md:h-6 text-yellow-600" />,
}

const PERIOD_LABELS: Record<Period, string> = {
  current_month: 'Mês Atual',
  last_month: 'Mês Passado',
  '90d': '90 Dias',
  '12m': '12 Meses',
}

const PERIOD_OPTIONS: Period[] = ['current_month', 'last_month', '90d', '12m']

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date()
  let start: Date
  let end: Date

  switch (period) {
    case 'current_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = now
      break
    case 'last_month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0) 
      break
    case '90d':
      start = new Date(now)
      start.setDate(start.getDate() - 90)
      end = now
      break
    case '12m':
      start = new Date(now)
      start.setFullYear(start.getFullYear() - 1)
      end = now
      break
  }

  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  }
}

function processCards(rows: RpcRow[], period: Period): CardData[] {
  const byIndicator = new Map<string, RpcRow[]>()
  for (const row of rows) {
    const existing = byIndicator.get(row.indicator_id) || []
    existing.push(row)
    byIndicator.set(row.indicator_id, existing)
  }

  const cards: CardData[] = []
  const periodLabel = PERIOD_LABELS[period]

  for (const [indicatorId, wardRows] of byIndicator) {
    const first = wardRows[0]
    
    let mainValue = 0
    if (first.aggregation_method === 'avg') {
      mainValue = wardRows.reduce((acc, r) => acc + r.computed_value, 0)
    } else {
      mainValue = wardRows.reduce((acc, r) => acc + r.computed_value, 0)
    }

    let subtitle = ''
    if (first.aggregation_method === 'avg') subtitle = `Média (${periodLabel})`
    else if (first.aggregation_method === 'sum') subtitle = `Total (${periodLabel})`
    else subtitle = 'Atual'

    let best = { name: '-', value: 0, score: -1 }
    let worst = { name: '-', value: 0, score: Infinity }

    for (const row of wardRows) {
      const members = row.ward_membership && row.ward_membership > 0 ? row.ward_membership : 1
      const score = (row.computed_value / members) * 1000

      if (score > best.score) best = { name: row.ward_name, value: row.computed_value, score }
      if (score < worst.score) worst = { name: row.ward_name, value: row.computed_value, score }
    }

    if (best.score === -1) best = { name: '-', value: 0, score: 0 }
    if (worst.score === Infinity) worst = { name: '-', value: 0, score: 0 }

    cards.push({
      id: indicatorId, slug: first.slug, display_name: first.display_name,
      value: mainValue, subtitle,
      bestWard: best.name, bestValue: best.value,
      worstWard: worst.name, worstValue: worst.value,
    })
  }

  const orderMap = new Map(rows.map(r => [r.indicator_id, r.order_index]))
  cards.sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0))
  return cards
}

// ═══════════════════════════════════════
// COMPONENTE
// ═══════════════════════════════════════

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  // Estado Principal
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('current_month')
  const [selectedWardId, setSelectedWardId] = useState('')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Estado Gráfico Evolução
  const [chartWardId, setChartWardId] = useState('')
  const [chartIndicatorId, setChartIndicatorId] = useState('')
  const [chartData, setChartData] = useState<{ week: string; valor: number }[]>([])
  const [isChartLoading, setIsChartLoading] = useState(false)

  // Estado AI e Impressão
  const [isPrintingXRay, setIsPrintingXRay] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<string | null>(null)
  
  // Efeito de Digitação da IA
  const [displayedAiResult, setDisplayedAiResult] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)

  // Dados
  const [rpcData, setRpcData] = useState<RpcRow[]>([])
  const [wards, setWards] = useState<Ward[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [targetMatrix, setTargetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [stakeTotals, setStakeTotals] = useState<Record<string, number>>({})

  // ─── Carregar definições (uma vez) ───
  const loadDefinitions = useCallback(async () => {
    const [indRes, wardRes] = await Promise.all([
      supabase.from('indicators').select('id, slug, display_name, order_index').eq('active', true).order('order_index'),
      supabase.from('wards').select('id, name, membership_count').eq('active', true).order('name'),
    ])

    if (indRes.data) {
      setIndicators(indRes.data)
      if (indRes.data.length > 0) setChartIndicatorId(indRes.data[0].id)
    }
    if (wardRes.data) {
      setWards(wardRes.data)
      if (wardRes.data.length > 0) {
        setSelectedWardId(wardRes.data[0].id)
        setChartWardId(wardRes.data[0].id)
      }
    }
  }, [supabase])

  // ─── Carregar dados Visão Geral ───
  const loadDashboardData = useCallback(async () => {
    if (wards.length === 0) return
    setLoading(true)
    try {
      const { start, end } = getDateRange(selectedPeriod)
      const { data, error } = await supabase.rpc('get_dashboard_data_v2', { p_start: start, p_end: end })
      if (!error) setRpcData(data || [])
    } catch (err) { console.error(err) } 
    finally { setLoading(false) }
  }, [supabase, selectedPeriod, wards])

  // ─── Carregar metas ───
  const loadTargets = useCallback(async () => {
    if (indicators.length === 0) return
    const { data: targets } = await supabase.from('targets').select('*').eq('year', selectedYear)

    const matrix: Record<string, Record<string, number>> = {}
    const totals: Record<string, number> = {}
    indicators.forEach(ind => { totals[ind.id] = 0 })

    if (targets) {
      targets.forEach((t: any) => {
        const wId = String(t.ward_id)
        const iId = String(t.indicator_id)
        const val = Number(t.target_value) || 0
        if (!matrix[wId]) matrix[wId] = {}
        matrix[wId][iId] = val
        if (totals[iId] !== undefined) totals[iId] += val
      })
    }
    setTargetMatrix(matrix)
    setStakeTotals(totals)
  }, [supabase, selectedYear, indicators])

  // ─── Carregar Gráfico de Evolução ───
  const loadChartData = useCallback(async () => {
    if (!chartWardId || !chartIndicatorId) return
    setIsChartLoading(true)
    try {
      const start = new Date()
      start.setDate(start.getDate() - 90)

      const { data } = await supabase.rpc('get_report_data', {
        p_start: start.toISOString().split('T')[0],
        p_end: new Date().toISOString().split('T')[0],
      })

      if (data) {
        const filtered = data.filter((d: any) => d.ward_id === chartWardId && d.indicator_id === chartIndicatorId)
        const formatted = filtered.map((d: any) => ({
          week: new Date(d.week_start + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          valor: d.raw_value
        }))
        setChartData(formatted)
      }
    } catch (err) { console.error(err) } 
    finally { setIsChartLoading(false) }
  }, [supabase, chartWardId, chartIndicatorId])

  // ─── Effects ───
  useEffect(() => { loadDefinitions() }, [loadDefinitions])
  useEffect(() => { loadDashboardData() }, [loadDashboardData])
  useEffect(() => { loadTargets() }, [loadTargets])
  useEffect(() => { loadChartData() }, [loadChartData])

  // Ao mudar de unidade no Raio-X, limpar a resposta da IA
  useEffect(() => { 
    setAiResult(null) 
    setDisplayedAiResult(null)
  }, [selectedWardId])

  // ─── Efeito Máquina de Escrever (Typing Effect) ───
  useEffect(() => {
    if (!aiResult) {
      setDisplayedAiResult(null)
      setIsTyping(false)
      return
    }

    setIsTyping(true)
    let currentText = ''
    let currentIndex = 0
    
    // Velocidade da digitação (15ms por caractere fica bem natural)
    const interval = setInterval(() => {
      if (currentIndex < aiResult.length) {
        currentText += aiResult[currentIndex]
        setDisplayedAiResult(currentText)
        currentIndex++
      } else {
        setIsTyping(false)
        clearInterval(interval)
      }
    }, 15) 

    return () => clearInterval(interval)
  }, [aiResult])

  // ─── Dados Processados ───
  const mainCards = useMemo(() => processCards(rpcData, selectedPeriod), [rpcData, selectedPeriod])

  const wardMetrics: WardMetric[] = useMemo(() => {
    if (!selectedWardId || indicators.length === 0) return []
    return indicators.map(ind => {
      const row = rpcData.find(r => r.ward_id === selectedWardId && r.indicator_id === ind.id)
      const value = row?.computed_value || 0
      const target = targetMatrix[selectedWardId]?.[ind.id] || 0
      const gap = target > 0 ? Math.max(0, target - value) : 0
      const progress = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0

      return { id: ind.id, slug: ind.slug, display_name: ind.display_name, value, target, gap, progress }
    })
  }, [rpcData, selectedWardId, indicators, targetMatrix])

  // ─── Ações Webhook e Impressão ───
  const handlePrintXRay = () => {
    setIsPrintingXRay(true)
    setTimeout(() => {
      window.print()
      setIsPrintingXRay(false)
    }, 150)
  }

  const handleGenerateAI = async () => {
    if (wardMetrics.length === 0) return
    setAiLoading(true)
    setAiResult(null)
    setDisplayedAiResult(null)
    
    try {
      const wardName = wards.find(w => w.id === selectedWardId)?.name || 'Unidade'
      const payload = {
        unidade: wardName,
        data_geracao: new Date().toLocaleDateString('pt-BR'),
        metricas: wardMetrics.map(m => ({
          indicador: m.display_name,
          valor_atual: m.value,
          meta: m.target,
          progresso: m.progress,
          distancia_meta: m.gap
        }))
      }

      const response = await fetch('https://webhooks.oryen.agency/webhook/chamados-a-servir-analise-ia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const textResponse = await response.text()
      try {
        let json = JSON.parse(textResponse)
        if (Array.isArray(json)) json = json[0]
        setAiResult(json.analise || json.output || json.message || textResponse)
      } catch {
        setAiResult(textResponse)
      }
    } catch (error) {
      console.error('Erro webhook IA:', error)
      setAiResult('Ocorreu um erro ao comunicar com a inteligência artificial. Tente novamente.')
    } finally {
      setAiLoading(false)
    }
  }

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  return (
    <main className={`w-full min-h-screen font-sans ${isPrintingXRay ? 'is-printing-xray' : ''}`}>
      <div className="w-full mx-auto space-y-8">
        
        {/* HEADER GERAL */}
        <header className="pt-2 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hide-on-xray-print">
          <div className="text-center md:text-left">
            <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight" style={{ color: COLORS.title }}>
              Dashboard
            </h1>
            <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mt-1">
              Análise & Performance
            </p>
          </div>

          <div className="relative group flex justify-center md:justify-end">
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0069a8] text-white font-bold text-xs rounded-xl hover:bg-[#00588d] transition-all shadow-lg">
              <FileText size={16} /> Exportar Relatórios
              <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={() => router.push('/relatorio')} className="w-full text-left px-4 py-3 hover:bg-sky-50 flex items-center gap-3 transition-colors">
                <FileText size={16} className="text-[#0069a8] shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-700">Relatório Visual</p>
                  <p className="text-[10px] text-slate-400">Imprimir Estaca / PDF</p>
                </div>
              </button>
              <div className="mx-3 my-1 border-t border-slate-100" />
              <button onClick={() => router.push('/relatorio?csv=1')} className="w-full text-left px-4 py-3 hover:bg-emerald-50 flex items-center gap-3 transition-colors">
                <FileSpreadsheet size={16} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-700">Dados Brutos</p>
                  <p className="text-[10px] text-slate-400">CSV para Excel</p>
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* BLOCO 1: VISÃO GERAL */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden p-4 md:p-8 hide-on-xray-print">
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-600" />
              <h2 className="text-lg font-black text-slate-700">Visão Geral da Estaca</h2>
            </div>
            <div className="flex p-1 bg-slate-100 rounded-xl overflow-hidden w-full md:w-auto overflow-x-auto shrink-0">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p} onClick={() => setSelectedPeriod(p)}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] md:text-sm font-black transition-all whitespace-nowrap ${
                    selectedPeriod === p ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 ${loading ? 'opacity-50' : ''}`}>
            {mainCards.map((card) => (
              <div key={card.id} className="group bg-white p-3 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm hover:border-sky-200 hover:shadow-md transition-all flex flex-col justify-between h-full min-h-[160px]">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-wide leading-3 pr-1 line-clamp-3">
                      {card.display_name}
                    </span>
                    <span className="text-[8px] md:text-[10px] text-slate-400 font-medium mt-1">{card.subtitle}</span>
                  </div>
                  <div className="p-1.5 md:p-3 bg-slate-50 group-hover:bg-sky-50 rounded-lg md:rounded-2xl transition-colors shrink-0">
                    {ICON_MAP[card.slug]}
                  </div>
                </div>
                <div className="mt-2 mb-2">
                  <p className="text-2xl md:text-4xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors">
                    {card.value}
                  </p>
                </div>
                <div className="mt-auto pt-3 border-t border-slate-50 grid grid-cols-2 gap-2">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1 mb-0.5">
                      <Trophy className="w-3 h-3 text-amber-500" />
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Destaque</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-700 truncate" title={card.bestWard}>{card.bestWard}</span>
                    <span className="text-[9px] text-slate-400">{card.bestValue}</span>
                  </div>
                  <div className="flex flex-col border-l border-slate-50 pl-2">
                    <div className="flex items-center gap-1 mb-0.5">
                      <AlertCircle className="w-3 h-3 text-rose-400" />
                      <span className="text-[8px] font-bold text-slate-400 uppercase">Atenção</span>
                    </div>
                    <span className="text-[9px] font-bold text-slate-700 truncate" title={card.worstWard}>{card.worstWard}</span>
                    <span className="text-[9px] text-slate-400">{card.worstValue}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCO NOVO: GRÁFICO DE EVOLUÇÃO SEMANAL */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden hide-on-xray-print">
          <div className="p-4 md:p-8 bg-sky-50/30 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-black text-slate-800">Evolução Semanal</h2>
                <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase">Últimos 90 dias</p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <select
                value={chartWardId} onChange={(e) => setChartWardId(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 text-[10px] md:text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2 font-bold shadow-sm"
              >
                {wards.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
              <select
                value={chartIndicatorId} onChange={(e) => setChartIndicatorId(e.target.value)}
                className="bg-white border border-slate-200 text-slate-700 text-[10px] md:text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2 font-bold shadow-sm"
              >
                {indicators.map((i) => (<option key={i.id} value={i.id}>{i.display_name}</option>))}
              </select>
            </div>
          </div>

          <div className="p-4 md:p-8 h-72 md:h-96 relative">
            {isChartLoading && (
              <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
              </div>
            )}
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    labelStyle={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}
                  />
                  <Line 
                    type="monotone" dataKey="valor" name="Valor Registrado"
                    stroke={COLORS.chartLine} strokeWidth={3} 
                    dot={{ r: 4, fill: COLORS.chartLine, strokeWidth: 2, stroke: '#fff' }} 
                    activeDot={{ r: 6 }} connectNulls 
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
               <div className="flex h-full items-center justify-center text-slate-400 font-medium text-sm">
                 Sem dados semanais para este filtro.
               </div>
            )}
          </div>
        </section>

        {/* BLOCO 3: RAIO-X DA UNIDADE */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden xray-section">
          <div className="p-4 md:p-8 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            
            <div className="flex items-center gap-3 shrink-0">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 print:hidden">
                <Search className="w-5 h-5" />
              </div>
              <h2 className="text-lg md:text-xl font-black text-slate-800">Raio-X da Unidade</h2>
            </div>

            <div className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-3 w-full justify-start md:justify-end print:hidden">
              <button 
                onClick={handleGenerateAI} disabled={aiLoading || isTyping}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] md:text-xs font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span className="hidden sm:inline">Análise IA</span>
                <span className="sm:hidden">IA</span>
              </button>

              <button 
                onClick={handlePrintXRay}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-[10px] md:text-xs font-bold rounded-lg transition-colors shadow-sm shrink-0"
              >
                <Printer size={14} />
                <span className="hidden sm:inline">Exportar Raio-X</span>
                <span className="sm:hidden">PDF</span>
              </button>

              <select
                value={selectedWardId} onChange={(e) => setSelectedWardId(e.target.value)}
                className="bg-white border border-slate-300 text-slate-700 text-xs md:text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 p-2 font-bold min-w-[120px] max-w-[160px] md:max-w-[200px] shrink-0"
              >
                {wards.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>

              <div className="flex p-1 bg-white border border-slate-200 rounded-lg overflow-x-auto shrink-0 max-w-full">
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p} onClick={() => setSelectedPeriod(p)}
                    className={`px-2 md:px-3 py-1.5 rounded-md text-[10px] md:text-xs font-black transition-all whitespace-nowrap ${
                      selectedPeriod === p ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="hidden print:block p-8 pb-0">
            <h1 className="text-3xl font-black text-slate-800">{wards.find(w => w.id === selectedWardId)?.name}</h1>
            <p className="text-sm font-bold text-slate-500">Raio-X de Desempenho • Período: {PERIOD_LABELS[selectedPeriod]}</p>
          </div>

          {/* Analise IA Resultado com Efeito Typing */}
          {(displayedAiResult || aiLoading) && (
            <div className="m-4 md:m-8 p-5 bg-indigo-50 border border-indigo-100 rounded-2xl relative transition-all">
              <div className="flex items-center gap-2 mb-3 text-indigo-700">
                <Bot size={20} />
                <h3 className="font-black text-sm">Insights da Inteligência Artificial</h3>
                {aiLoading && <Loader2 size={14} className="animate-spin ml-2 text-indigo-400" />}
              </div>
              <p className="text-sm text-indigo-900 font-medium whitespace-pre-wrap leading-relaxed min-h-[20px]">
                {displayedAiResult}
                {isTyping && (
                  <span className="animate-pulse inline-block w-1.5 h-4 ml-0.5 bg-indigo-600 align-middle"></span>
                )}
                {aiLoading && !displayedAiResult && (
                  <span className="animate-pulse text-indigo-400">Analisando os dados da unidade...</span>
                )}
              </p>
            </div>
          )}

          <div className="p-4 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {wardMetrics.map((metric) => (
                <div key={metric.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100 relative overflow-hidden print:border-slate-300">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="text-slate-400 scale-75 origin-left">{ICON_MAP[metric.slug]}</div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider truncate max-w-[120px]" title={metric.display_name}>
                        {metric.display_name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-2xl font-black text-slate-800">{metric.value}</span>
                    <div className="text-right">
                      <span className="block text-[10px] text-slate-400 uppercase font-bold">Meta</span>
                      <span className="text-sm font-bold text-slate-600">{metric.target}</span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2 print:border print:border-slate-300 print:bg-transparent">
                    <div
                      className={`h-1.5 rounded-full print:bg-slate-500 ${metric.progress >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                      style={{ width: `${metric.progress}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className={metric.progress >= 100 ? 'text-emerald-600 print:text-slate-800' : 'text-sky-600 print:text-slate-800'}>
                      {metric.progress}% Concluído
                    </span>
                    {metric.target > 0 && metric.gap > 0 ? (
                      <span className="text-rose-500 print:text-slate-600">Faltam {metric.gap}</span>
                    ) : (
                      metric.target > 0 && <span className="text-emerald-500 print:text-slate-800">Meta Batida!</span>
                    )}
                  </div>
                </div>
              ))}
              {wardMetrics.length === 0 && (
                <div className="col-span-full text-center py-10 text-slate-400 text-sm font-medium">
                  Selecione uma unidade para ver o Raio-X.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* BLOCO 4: METAS */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden hide-on-xray-print">
          <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between bg-slate-50/50 gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 md:p-3 bg-amber-50 rounded-xl shrink-0">
                <Target className="w-5 h-5 md:w-6 md:h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base md:text-2xl font-black text-slate-800">Metas {selectedYear}</h2>
              </div>
            </div>

            <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm w-full md:w-auto overflow-x-auto shrink-0">
              {[2025, 2026, 2027].map((year) => (
                <button
                  key={year} onClick={() => setSelectedYear(year)}
                  className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-[10px] md:text-sm font-black transition-all whitespace-nowrap ${
                    selectedYear === year ? 'bg-sky-700 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto relative pb-2">
            {wards.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">Carregando...</div>
            ) : (
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-100/50">
                    <th className="sticky left-0 bg-slate-100 z-20 p-3 text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[100px]">
                      Unidade
                    </th>
                    {indicators.map((ind) => (
                      <th key={ind.id} className="p-2 md:p-3 text-center align-bottom border-b border-slate-200 min-w-[70px] md:min-w-[100px]">
                        <div className="flex flex-col items-center justify-end w-full gap-1.5">
                          <div className="shrink-0">{ICON_MAP[ind.slug]}</div>
                          <span className="hidden md:block text-[10px] lg:text-[11px] leading-3 font-bold text-slate-600 uppercase tracking-tight w-full max-w-[120px] whitespace-normal break-words line-clamp-2">
                            {ind.display_name}
                          </span>
                          <span className="md:hidden truncate text-[9px] font-semibold text-slate-500 w-full max-w-[60px]">
                            {ind.display_name}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-sky-50/30 border-b border-sky-100">
                    <td className="sticky left-0 bg-sky-50 z-10 p-3 border-r border-sky-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      <span className="font-black text-sky-800 uppercase text-[9px] md:text-xs">Total</span>
                    </td>
                    {indicators.map((ind) => (
                      <td key={ind.id} className="p-3 text-center">
                        <span className="text-sm md:text-xl font-black text-sky-900">{stakeTotals[ind.id] || 0}</span>
                      </td>
                    ))}
                  </tr>
                  {wards.map((ward) => (
                    <tr key={ward.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                      <td className="sticky left-0 bg-white hover:bg-slate-50 z-10 p-3 font-bold text-slate-700 text-[10px] md:text-sm border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                        {ward.name}
                      </td>
                      {indicators.map((ind) => (
                        <td key={ind.id} className="p-3 text-center font-bold text-slate-600 text-xs md:text-base">
                          {targetMatrix[ward.id]?.[ind.id] !== undefined ? (
                            targetMatrix[ward.id][ind.id]
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="py-8 border-t border-slate-200 text-center opacity-50 space-y-2 hide-on-xray-print">
          <Church className="w-4 h-4 text-slate-400 mx-auto mb-2" />
          <p className="text-[10px] text-slate-500 font-medium">
            Este sistema não é um produto oficial da Igreja de Jesus Cristo dos Santos dos Últimos Dias.
          </p>
          <p className="text-[9px] text-slate-400 font-mono">Versão 1.6.0</p>
        </footer>
      </div>

      {/* CSS para Impressão Específica do Raio-X */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          @page { margin: 1cm; size: A4 portrait; }
          
          /* Esconde tudo que tem essa classe quando acionado via botão PDF */
          .is-printing-xray .hide-on-xray-print {
            display: none !important;
          }
          
          /* Remove margens extras e estilos do card para focar no conteúdo */
          .is-printing-xray .xray-section {
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
          }
        }
      `}} />
    </main>
  )
}