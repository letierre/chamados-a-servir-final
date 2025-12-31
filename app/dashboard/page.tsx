'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../lib/supabase/client'
import { 
  TrendingUp, Calendar, Users, UserPlus, Heart, Church, 
  Award, BookOpen, ChevronLeft, ChevronRight, Target
} from 'lucide-react'

// --- Tipos para corrigir os erros vermelhos ---
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

// Cores do tema
const COLORS = {
  primary: '#006184',
  secondary: '#105970',
  title: '#0e4f66', // Escurecido para melhor contraste
  background: '#f8fafc',
}

const ICON_MAP: Record<string, any> = {
  frequencia_sacramental: <Church className="w-5 h-5 md:w-6 md:h-6 text-sky-600" />,
  batismo_converso: <UserPlus className="w-5 h-5 md:w-6 md:h-6 text-emerald-600" />,
  membros_retornando_a_igreja: <Users className="w-5 h-5 md:w-6 md:h-6 text-orange-600" />,
  membros_participantes: <Users className="w-5 h-5 md:w-6 md:h-6 text-blue-600" />,
  membros_jejuando: <Heart className="w-5 h-5 md:w-6 md:h-6 text-rose-600" />,
  missionario_servindo_missao_do_brasil: <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />,
  recomendacao_templo_com_investidura: <Award className="w-5 h-5 md:w-6 md:h-6 text-amber-600" />,
  recomendacao_templo_sem_investidura: <Award className="w-5 h-5 md:w-6 md:h-6 text-yellow-600" />,
}

export default function DashboardPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  
  // Estados tipados
  const [mainCards, setMainCards] = useState<DashboardData[]>([])
  const [referenceDate, setReferenceDate] = useState<Date | null>(null)
  const [weekLabel, setWeekLabel] = useState('')

  const [selectedYear, setSelectedYear] = useState(2026) 
  const [definitions, setDefinitions] = useState<{wards: Ward[], indicators: Indicator[]}>({ wards: [], indicators: [] })
  
  // Matrizes tipadas para evitar erro de índice
  const [targetMatrix, setTargetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [stakeTotals, setStakeTotals] = useState<Record<string, number>>({})

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
      // Busca segura com conversão de número
      const { data: targets, error } = await supabase
        .from('targets')
        .select('*')
        .eq('year', Number(year));

      if (error) {
        console.error("Erro Supabase:", error);
        return;
      }

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
    <main className="min-h-screen p-3 sm:p-4 md:p-8 font-sans" style={{ backgroundColor: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto space-y-8 md:space-y-12">
        
        {/* HEADER */}
        <header className="py-2 md:py-4 text-center md:text-left">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight" style={{ color: COLORS.title }}>
            Dashboard da Estaca
          </h1>
          <p className="text-slate-600 font-bold uppercase text-xs sm:text-sm tracking-widest mt-2">
            Gestão de Indicadores e Metas
          </p>
        </header>

        {/* BLOCO 1: RESULTADOS (Cards Maiores) */}
        <section className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden p-5 md:p-10 transition-all">
          <div className="flex flex-col lg:flex-row items-center justify-between mb-8 gap-6 border-b border-slate-100 pb-8">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="p-3 md:p-4 bg-sky-50 rounded-2xl shrink-0">
                <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <div className="text-left">
                <h2 className="text-xl md:text-2xl font-black text-slate-800">Resultados da Estaca</h2>
                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wide">Consolidação atual</p>
              </div>
            </div>

            <div className="flex items-center justify-between w-full lg:w-auto gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <button onClick={() => changeWeek(-1)} className="p-2 md:p-3 hover:bg-white rounded-xl transition-all text-slate-500 hover:text-sky-700 hover:shadow-sm shrink-0">
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              
              <div className="flex items-center gap-2 md:gap-3 px-2 md:px-6 justify-center flex-1 lg:min-w-[220px]">
                <Calendar className="w-4 h-4 md:w-5 md:h-5 text-sky-600 hidden sm:block" />
                <span className="font-black text-slate-700 text-sm md:text-lg whitespace-nowrap text-center">{weekLabel}</span>
              </div>
              
              <button onClick={() => changeWeek(1)} className="p-2 md:p-3 hover:bg-white rounded-xl transition-all text-slate-500 hover:text-sky-700 hover:shadow-sm shrink-0">
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 ${loading ? 'opacity-50' : ''}`}>
            {mainCards.map((card) => (
              <div key={card.id} className="group bg-white p-6 md:p-8 rounded-2xl md:rounded-[2rem] border-2 border-slate-50 shadow-sm hover:border-sky-100 hover:shadow-xl transition-all duration-300">
                <div className="flex justify-between items-start mb-4 md:mb-6">
                  {/* Título mais escuro e legível */}
                  <span className="text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest max-w-[140px] leading-relaxed pr-2">
                    {card.display_name}
                  </span>
                  <div className="p-2 md:p-3 bg-slate-50 group-hover:bg-sky-50 rounded-xl md:rounded-2xl transition-colors shrink-0">
                    {ICON_MAP[card.slug]}
                  </div>
                </div>
                {/* Número bem maior */}
                <p className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-800 tracking-tighter group-hover:text-sky-800 transition-colors">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCO 2: METAS ANUAIS */}
        <section className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-6 md:p-10 border-b border-slate-100 flex flex-col lg:flex-row items-center justify-between bg-slate-50/80 gap-6">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="p-3 md:p-4 bg-amber-50 rounded-2xl shrink-0">
                <Target className="w-6 h-6 md:w-8 md:h-8 text-amber-600" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-slate-800">Metas Anuais - {selectedYear}</h2>
                <p className="text-slate-500 text-[10px] md:text-xs font-bold uppercase tracking-wide">Planejamento por unidade</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-auto overflow-x-auto">
              {[2025, 2026, 2027].map((year) => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`flex-1 lg:flex-none px-4 md:px-6 py-2 md:py-3 rounded-xl text-xs md:text-sm font-black transition-all whitespace-nowrap ${
                    selectedYear === year 
                    ? 'bg-sky-700 text-white shadow-md transform scale-105' 
                    : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            {definitions.wards.length === 0 ? (
               <div className="p-12 text-center text-slate-500 font-bold text-lg">Carregando dados...</div>
            ) : (
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-slate-100/50">
                  {/* Sticky Column Header */}
                  <th className="sticky left-0 bg-slate-100/90 backdrop-blur-sm z-20 p-4 md:p-6 text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-200 w-[160px] md:w-[220px] shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                    Unidade
                  </th>
                  {definitions.indicators.map(ind => (
                    <th key={ind.id} className="p-4 md:p-6 text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 text-center align-bottom min-w-[140px]">
                      <div className="flex flex-col items-center gap-3 h-full justify-end">
                        {ICON_MAP[ind.slug]}
                        <span className="leading-tight whitespace-normal max-w-[120px]">{ind.display_name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Linha de Totais */}
                <tr className="bg-sky-50/50 border-b-2 border-sky-100">
                   {/* Sticky Total Label */}
                  <td className="sticky left-0 bg-sky-50 z-10 p-4 md:p-6 border-r border-sky-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                    <span className="font-black text-sky-800 uppercase text-[10px] md:text-xs tracking-wider">Métrica Estaca (Soma)</span>
                  </td>
                  {definitions.indicators.map(ind => (
                    <td key={ind.id} className="p-4 md:p-6 text-center">
                      <span className="text-xl md:text-2xl font-black text-sky-900">
                        {stakeTotals[ind.id] || 0}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Linhas das Alas */}
                {definitions.wards.map(ward => (
                  <tr key={ward.id} className="hover:bg-slate-50 transition-colors group border-b border-slate-100 last:border-0">
                    {/* Sticky Ward Name */}
                    <td className="sticky left-0 bg-white group-hover:bg-slate-50 z-10 p-4 md:p-6 font-bold text-slate-700 text-xs md:text-sm border-r border-slate-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] transition-colors">
                      {ward.name}
                    </td>
                    {definitions.indicators.map(ind => (
                      <td key={ind.id} className="p-4 md:p-6 text-center font-bold text-slate-600 text-base md:text-lg">
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

        {/* RODAPÉ SOLICITADO */}
        <footer className="mt-8 md:mt-16 py-8 md:py-12 border-t border-slate-200 text-center space-y-4 px-4">
          <p className="font-bold text-slate-400 uppercase text-[10px] md:text-xs tracking-[0.2em]">
            Sistema não oficial de A Igreja de Jesus Cristo dos Santos dos Últimos Dias
          </p>
          <p className="text-slate-500 max-w-2xl mx-auto text-xs md:text-sm leading-relaxed">
            Criada por voluntários com objetivo de ajudar na administração dos indicadores das unidades da 
            <strong className="text-slate-700"> Estaca Santa Cruz do Sul Brasil</strong>.
          </p>
          <div className="pt-4 flex justify-center gap-4 opacity-50">
             <Church className="w-5 h-5 text-slate-400" />
          </div>
        </footer>

      </div>
    </main>
  )
}