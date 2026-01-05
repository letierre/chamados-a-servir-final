'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../lib/supabase/client'
import { 
  TrendingUp, Calendar, Users, UserPlus, Heart, Church, 
  Award, BookOpen, ChevronLeft, ChevronRight, Target
} from 'lucide-react'

// --- Tipos ---
type Indicator = {
  id: string
  slug: string
  display_name: string
  order_index: number
}

type Ward = {
  id: string
  name: string
}

type DashboardData = {
  id: string
  slug: string
  display_name: string
  value: number
}

const COLORS = {
  primary: '#006184',
  secondary: '#105970',
  title: '#0e4f66',
  background: '#f8fafc',
}

// Ícones responsivos
const ICON_MAP: Record<string, any> = {
  frequencia_sacramental: <Church className="w-4 h-4 md:w-6 md:h-6 text-sky-600" />,
  batismo_converso: <UserPlus className="w-4 h-4 md:w-6 md:h-6 text-emerald-600" />,
  membros_retornando_a_igreja: <Users className="w-4 h-4 md:w-6 md:h-6 text-orange-600" />,
  membros_participantes: <Users className="w-4 h-4 md:w-6 md:h-6 text-blue-600" />,
  membros_jejuando: <Heart className="w-4 h-4 md:w-6 md:h-6 text-rose-600" />,
  missionario_servindo_missao_do_brasil: <BookOpen className="w-4 h-4 md:w-6 md:h-6 text-indigo-600" />,
  recomendacao_templo_com_investidura: <Award className="w-4 h-4 md:w-6 md:h-6 text-amber-600" />,
  recomendacao_templo_sem_investidura: <Award className="w-4 h-4 md:w-6 md:h-6 text-yellow-600" />,
}

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  
  const [mainCards, setMainCards] = useState<DashboardData[]>([])
  const [referenceDate, setReferenceDate] = useState<Date | null>(null)
  const [weekLabel, setWeekLabel] = useState('')

  const [selectedYear, setSelectedYear] = useState(2026) 
  const [definitions, setDefinitions] = useState<{wards: Ward[], indicators: Indicator[]}>({ wards: [], indicators: [] })
  
  const [targetMatrix, setTargetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [stakeTotals, setStakeTotals] = useState<Record<string, number>>({})

  // --- Lógica Mantida ---
  const getCustomWeekNumber = (d: Date) => {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  }

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay(); 
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  }

  const loadWeeklyData = useCallback(async (dateToLoad: Date) => {
    try {
      setLoading(true);
      const sunday = getStartOfWeek(dateToLoad);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);

      const startIso = sunday.toISOString().split('T')[0];
      const endIso = saturday.toISOString().split('T')[0];
      setWeekLabel(`Semana ${getCustomWeekNumber(dateToLoad)} de ${dateToLoad.getFullYear()}`);

      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      
      const { data: weekRawData } = await supabase
        .from('weekly_indicator_data')
        .select('*')
        .gte('week_start', startIso)
        .lte('week_start', endIso);

      if (indicators) {
        const summary = indicators.map((ind: Indicator) => ({
          id: ind.id,
          slug: ind.slug,
          display_name: ind.display_name,
          value: (weekRawData || [])
            .filter((d: any) => d.indicator_id === ind.id)
            .reduce((acc: number, curr: any) => acc + (Number(curr.value) || 0), 0)
        }));
        setMainCards(summary);
      }
    } catch (err) {
      console.error('Erro Bloco 1:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const loadDefinitions = useCallback(async () => {
    try {
      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      const { data: wards } = await supabase.from('wards').select('id, name').order('name');
      
      if (indicators && wards) {
        setDefinitions({ wards, indicators });
      }
    } catch (err) {
      console.error('Erro ao carregar definições:', err);
    }
  }, [supabase]);

  const loadTargetsForYear = useCallback(async (year: number) => {
    try {
      const { data: targets, error } = await supabase
        .from('targets')
        .select('*')
        .eq('year', Number(year));

      if (error) { return; }

      const matrix: Record<string, Record<string, number>> = {};
      const totals: Record<string, number> = {};

      definitions.indicators.forEach(ind => { totals[ind.id] = 0; });

      if (targets && targets.length > 0) {
        targets.forEach((t: any) => {
          const wId = String(t.ward_id);
          const iId = String(t.indicator_id);
          const val = Number(t.target_value) || 0;

          if (!matrix[wId]) matrix[wId] = {};
          matrix[wId][iId] = val;

          if (totals[iId] !== undefined) {
            totals[iId] += val;
          }
        });
      }

      setTargetMatrix(matrix);
      setStakeTotals(totals);

    } catch (err) {
      console.error('Erro processamento:', err);
    }
  }, [supabase, definitions]); 

  useEffect(() => {
    async function init() {
      await loadDefinitions();
      const { data: lastEntry } = await supabase
        .from('weekly_indicator_data')
        .select('week_start')
        .order('week_start', { ascending: false })
        .limit(1).single();

      const initialDate = lastEntry ? new Date(lastEntry.week_start + 'T12:00:00') : new Date();
      setReferenceDate(initialDate);
      loadWeeklyData(initialDate);
    }
    init();
  }, [supabase, loadDefinitions, loadWeeklyData]);

  useEffect(() => {
    if (definitions.wards.length > 0) {
      loadTargetsForYear(selectedYear);
    }
  }, [selectedYear, definitions, loadTargetsForYear]);

  const changeWeek = (offset: number) => {
    if (!referenceDate) return;
    const newDate = new Date(referenceDate);
    newDate.setDate(newDate.getDate() + (offset * 7));
    setReferenceDate(newDate);
    loadWeeklyData(newDate);
  }

  return (
    // Removido padding excessivo do container principal para aproveitar a tela
    <main className="w-full min-h-screen font-sans">
      <div className="w-full mx-auto space-y-6">
        
        {/* HEADER: Ajustado para centralizar e ocupar menos espaço */}
        <header className="pt-2 pb-4 text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight" style={{ color: COLORS.title }}>
            Dashboard
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mt-1">
            Gestão de Indicadores
          </p>
        </header>

        {/* BLOCO 1: RESULTADOS */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden p-4 md:p-8 transition-all">
          
          <div className="flex flex-col md:flex-row items-center justify-between mb-4 md:mb-6 gap-4 border-b border-slate-100 pb-4">
            {/* Seletor de Data Full Width Mobile */}
            <div className="flex items-center justify-between w-full md:w-auto bg-slate-50 p-1 rounded-xl border border-slate-200">
              <button onClick={() => changeWeek(-1)} className="p-2 md:p-3 hover:bg-white rounded-lg text-slate-500 shadow-sm transition-all active:scale-95">
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              
              <div className="flex items-center gap-2 px-2">
                <Calendar className="w-3 h-3 text-sky-600 hidden sm:block" />
                <span className="font-black text-slate-700 text-xs md:text-base whitespace-nowrap">{weekLabel}</span>
              </div>
              
              <button onClick={() => changeWeek(1)} className="p-2 md:p-3 hover:bg-white rounded-lg text-slate-500 shadow-sm transition-all active:scale-95">
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          {/* GRID INTELIGENTE: Layout ajustado para evitar quebra de texto */}
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 ${loading ? 'opacity-50' : ''}`}>
            {mainCards.map((card) => (
              <div key={card.id} className="group bg-white p-3 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm hover:border-sky-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full min-h-[100px]">
                
                <div className="flex justify-between items-start mb-2">
                  {/* Fonte reduzida para mobile e quebra de linha permitida */}
                  <span className="text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-wide leading-3 pr-1 line-clamp-3">
                    {card.display_name}
                  </span>
                  <div className="p-1.5 md:p-3 bg-slate-50 group-hover:bg-sky-50 rounded-lg md:rounded-2xl transition-colors shrink-0">
                    {ICON_MAP[card.slug]}
                  </div>
                </div>

                {/* Valor ajustado */}
                <p className="text-2xl md:text-5xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors mt-auto">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCO 2: METAS */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden">
          <div className="p-4 md:p-8 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between bg-slate-50/50 gap-4">
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 md:p-3 bg-amber-50 rounded-xl shrink-0">
                <Target className="w-5 h-5 md:w-6 md:h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base md:text-2xl font-black text-slate-800">Metas {selectedYear}</h2>
              </div>
            </div>

            <div className="flex gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm w-full md:w-auto overflow-x-auto">
              {[2025, 2026, 2027].map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`flex-1 md:flex-none px-3 py-1.5 rounded-md text-[10px] md:text-sm font-black transition-all whitespace-nowrap ${
                    selectedYear === year 
                    ? 'bg-sky-700 text-white shadow-sm' 
                    : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto relative pb-2">
            {definitions.wards.length === 0 ? (
               <div className="p-8 text-center text-slate-400 font-bold text-xs">Carregando...</div>
            ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-100/50">
                  <th className="sticky left-0 bg-slate-100 z-20 p-3 text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[100px]">
                    Unidade
                  </th>
                  {definitions.indicators.map(ind => (
                    <th key={ind.id} className="p-3 text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 text-center align-bottom min-w-[80px] md:min-w-[120px]">
                      <div className="flex flex-col items-center gap-1">
                        {ICON_MAP[ind.slug]}
                        {/* Oculta nome longo no mobile se necessário, ou usa quebra */}
                        <span className="whitespace-normal max-w-[80px] leading-tight hidden md:block">{ind.display_name}</span>
                        <span className="md:hidden truncate max-w-[60px]">{ind.slug.split('_')[0]}...</span>
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
                  {definitions.indicators.map(ind => (
                    <td key={ind.id} className="p-3 text-center">
                      <span className="text-sm md:text-xl font-black text-sky-900">
                        {stakeTotals[ind.id] || 0}
                      </span>
                    </td>
                  ))}
                </tr>
                {definitions.wards.map(ward => (
                  <tr key={ward.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td className="sticky left-0 bg-white hover:bg-slate-50 z-10 p-3 font-bold text-slate-700 text-[10px] md:text-sm border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {ward.name}
                    </td>
                    {definitions.indicators.map(ind => (
                      <td key={ind.id} className="p-3 text-center font-bold text-slate-600 text-xs md:text-base">
                        {targetMatrix[ward.id]?.[ind.id] !== undefined 
                          ? targetMatrix[ward.id][ind.id] 
                          : <span className="text-slate-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </section>

        <footer className="py-6 border-t border-slate-200 text-center opacity-40">
           <Church className="w-4 h-4 text-slate-400 mx-auto" />
        </footer>
      </div>
    </main>
  )
}