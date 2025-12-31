'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { 
  Building2, Target, Calendar, Hash, Save, Loader2, 
  AlertCircle, CheckCircle2, History, Clock 
} from 'lucide-react'

// Definição de cores e estilos para consistência
const THEME = {
  primary: '#0069a8', // Cor solicitada para o botão
  primaryHover: '#00588d',
  textTitle: '#157493',
  bg: '#f8fafc',
}

type Ward = { id: string; name: string }
type Indicator = { id: string; display_name: string }
type RecentEntry = {
  id: string
  value: number
  week_start: string
  wards: { name: string }
  indicators: { display_name: string }
}

export default function LancamentosPage() {
  const supabase = createClient()
  const router = useRouter()

  const [wards, setWards] = useState<Ward[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])

  const [wardId, setWardId] = useState('')
  const [indicatorId, setIndicatorId] = useState('')
  const [value, setValue] = useState<string>('')
  const [weekStart, setWeekStart] = useState('')
  
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const fetchRecentEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from('weekly_indicator_data')
      .select(`
        id, value, week_start,
        wards ( name ),
        indicators ( display_name )
      `)
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (!error && data) setRecentEntries(data as any)
  }, [supabase])

  useEffect(() => {
    async function loadInitialData() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) {
          router.push('/login')
          return
        }

        const [wardsRes, indRes] = await Promise.all([
          supabase.from('wards').select('id, name').order('name'),
          supabase.from('indicators').select('id, display_name').order('display_name')
        ])

        if (wardsRes.data) setWards(wardsRes.data)
        if (indRes.data) setIndicators(indRes.data)
        
        await fetchRecentEntries()

      } catch (error) {
        console.error('Erro crítico:', error)
      } finally {
        setLoadingData(false)
      }
    }

    loadInitialData()
  }, [router, supabase, fetchRecentEntries])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSubmitting(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      const { error } = await supabase.from('weekly_indicator_data').insert({
        ward_id: wardId,
        indicator_id: indicatorId,
        value: Number(value),
        week_start: weekStart,
        source: 'manual',
        created_by: user?.id,
      })

      if (error) {
        if (error.code === '23505') {
          setMessage({ 
            type: 'error', 
            text: 'Ops! Esse indicador já foi lançado para esta ala nesta mesma data. Verifique o histórico.' 
          })
          return
        }
        throw error
      }

      setMessage({ type: 'success', text: 'Lançamento registrado com sucesso!' })
      setValue('')
      await fetchRecentEntries()
      
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Erro ao salvar: ' + (error.message || 'Tente novamente.') })
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: THEME.primary }} />
      </div>
    )
  }

  return (
    <main className="min-h-screen p-4 md:p-12 font-sans" style={{ backgroundColor: THEME.bg }}>
      <div className="mx-auto max-w-3xl">
        
        {/* HEADER */}
        <div className="mb-10 text-center md:text-left">
          <h1 className="text-4xl font-black tracking-tight mb-2" style={{ color: THEME.textTitle }}>Lançamento de Dados</h1>
          <p className="text-slate-500 font-semibold uppercase text-xs tracking-widest">Registre os indicadores semanais da Estaca</p>
        </div>

        <div className="grid grid-cols-1 gap-8">
          
          {/* Card do Formulário */}
          <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden relative">
            {/* Faixa decorativa no topo */}
            <div className="h-2 w-full absolute top-0 left-0" style={{ backgroundColor: THEME.primary }}></div>
            
            <div className="p-8 md:p-10">
              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* Agrupamento: Seleção */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Building2 size={16} className="text-slate-400" /> Ala / Ramo
                    </label>
                    <div className="relative">
                      <select 
                        value={wardId} 
                        onChange={e => setWardId(e.target.value)} 
                        required 
                        className="w-full appearance-none rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-4 text-slate-800 font-bold outline-none focus:border-[#0069a8] focus:bg-white transition-all"
                      >
                        <option value="">Selecione...</option>
                        {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <div className="w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1"></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Target size={16} className="text-slate-400" /> Indicador
                    </label>
                    <div className="relative">
                      <select 
                        value={indicatorId} 
                        onChange={e => setIndicatorId(e.target.value)} 
                        required 
                        className="w-full appearance-none rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-4 text-slate-800 font-bold outline-none focus:border-[#0069a8] focus:bg-white transition-all"
                      >
                        <option value="">Selecione...</option>
                        {indicators.map(i => <option key={i.id} value={i.id}>{i.display_name}</option>)}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <div className="w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Agrupamento: Dados */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Calendar size={16} className="text-slate-400" /> Dia da Semana
                    </label>
                    <input 
                      type="date" 
                      value={weekStart} 
                      onChange={e => setWeekStart(e.target.value)} 
                      required 
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-slate-800 font-bold outline-none focus:border-[#0069a8] focus:bg-white transition-all" 
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Hash size={16} className="text-slate-400" /> Valor Realizado
                    </label>
                    <input 
                      type="number" 
                      value={value} 
                      onChange={e => setValue(e.target.value)} 
                      required 
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-2xl font-black text-[#0069a8] outline-none focus:border-[#0069a8] focus:bg-white transition-all placeholder:text-slate-300" 
                      placeholder="0" 
                    />
                  </div>
                </div>

                {/* Mensagens */}
                {message && (
                  <div className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-800 border border-rose-100'}`}>
                    {message.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} className="shrink-0" />}
                    <span className="font-bold text-sm">{message.text}</span>
                  </div>
                )}

                {/* Botão de Ação */}
                <button 
                  disabled={submitting} 
                  type="submit" 
                  className="w-full flex items-center justify-center gap-2 text-white font-bold py-5 rounded-xl hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 transition-all text-lg shadow-lg shadow-blue-900/10"
                  style={{ backgroundColor: THEME.primary }}
                >
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : <><Save size={22}/> Salvar Lançamento</>}
                </button>
              </form>
            </div>
          </div>

          {/* LISTA DE ÚLTIMOS LANÇAMENTOS */}
          <div className="bg-white rounded-[2rem] shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 rounded-xl">
                    <History size={20} className="text-slate-500" />
                </div>
                <div>
                    <h2 className="font-black text-slate-800 text-lg">Histórico Recente</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Últimos 5 registros</p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {recentEntries.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                        <History size={24} className="text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-medium">Nenhum lançamento recente.</p>
                </div>
              ) : (
                recentEntries.map((entry) => (
                  <div key={entry.id} className="p-6 hover:bg-slate-50 transition-colors flex justify-between items-center group">
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-[#0069a8] font-bold">
                         <Hash size={18} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-700 group-hover:text-[#0069a8] transition-colors">{entry.indicators?.display_name}</span>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mt-0.5">
                          <Building2 size={12} /> {entry.wards?.name}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-2xl font-black text-slate-800 tracking-tight">{entry.value}</div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 justify-end bg-slate-100 px-2 py-0.5 rounded-full mt-1">
                        <Clock size={10} /> {new Date(entry.week_start).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  )
}