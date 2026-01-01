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

// Cores do tema
const COLORS = {
  primary: '#006184',
  secondary: '#105970',
  title: '#0e4f66',
  background: '#f8fafc',
}

// Ícones ajustados para serem responsivos (menores no mobile)
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
  
  const [mainCards, setMainCards] = useState<DashboardData[]>([])
  const [referenceDate, setReferenceDate] = useState<Date | null>(null)
  const [weekLabel, setWeekLabel] = useState('')

  const [selectedYear, setSelectedYear] = useState(2026) 
  const [definitions, setDefinitions] = useState<{wards: Ward[], indicators: Indicator[]}>({ wards: [], indicators: [] })
  
  const [targetMatrix, setTargetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [stakeTotals, setStakeTotals] = useState<Record<string, number>>({})

  // Funções auxiliares (Lógica mantida idêntica)
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
    // 'w-full' garante que ele ocupe o espaço disponível sem estourar se houver sidebar
    <main className="w-full min-h-screen p-3 md:p-8 font-sans" style={{ backgroundColor: COLORS.background }}>
      <div className="max-w-[1400px] mx-auto space-y-6 md:space-y-12">
        
        {/* HEADER: Mais compacto no mobile */}
        <header className="py-2 md:py-4 text-center md:text-left">
          <h1 className="text-2xl md:text-5xl font-black tracking-tight leading-tight" style={{ color: COLORS.title }}>
            Dashboard da Estaca
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-sm tracking-widest mt-1 md:mt-2">
            Gestão de Indicadores
          </p>
        </header>

        {/* BLOCO 1: RESULTADOS */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-4 md:p-10 transition-all">
          
          {/* Cabeçalho do Card: No mobile vira coluna, no desk linha */}
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4 border-b border-slate-100 pb-6">
            
            {/* Título da Seção */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-3 bg-sky-50 rounded-2xl shrink-0">
                <TrendingUp className="w-6 h-6 text-sky-700" />
              </div>
              <div className="text-left">
                <h2 className="text-lg md:text-2xl font-black text-slate-800 leading-tight">Resultados</h2>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Consolidação atual</p>
              </div>
            </div>

            {/* Seletor de Data: Full width no mobile para ficar fácil de clicar */}
            <div className="flex items-center justify-between w-full md:w-auto bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <button onClick={() => changeWeek(-1)} className="p-2 md:p-3 bg-white hover:bg-slate-100 rounded-lg text-slate-500 shadow-sm transition-all active:scale-95">
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              
              <div className="flex items-center gap-2 px-3">
                <Calendar className="w-4 h-4 text-sky-600 hidden sm:block" />
                <span className="font-black text-slate-700 text-xs md:text-lg whitespace-nowrap">{weekLabel}</span>
              </div>
              
              <button onClick={() => changeWeek(1)} className="p-2 md:p-3 bg-white hover:bg-slate-100 rounded-lg text-slate-500 shadow-sm transition-all active:scale-95">
                <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          {/* GRID INTELIGENTE: 2 Colunas no mobile, 4 no desktop */}
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-8 ${loading ? 'opacity-50' : ''}`}>
            {mainCards.map((card) => (
              <div key={card.id} className="group bg-white p-4 md:p-8 rounded-2xl border border-slate-100 shadow-sm hover:border-sky-200 hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full">
                
                <div className="flex justify-between items-start mb-2 md:mb-6">
                  {/* Nome do indicador menor no mobile */}
                  <span className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-wider leading-snug pr-2 line-clamp-2 md:line-clamp-none h-8 md:h-auto">
                    {card.display_name}
                  </span>
                  <div className="p-1.5 md:p-3 bg-slate-50 group-hover:bg-sky-50 rounded-lg md:rounded-2xl transition-colors shrink-0">
                    {ICON_MAP[card.slug]}
                  </div>
                </div>

                {/* Valor Grande */}
                <p className="text-3xl md:text-6xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors mt-auto">
                  {card.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCO 2: METAS ANUAIS */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-4 md:p-10 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between bg-slate-50/80 gap-4 md:gap-6">
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-3 bg-amber-50 rounded-2xl shrink-0">
                <Target className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg md:text-2xl font-black text-slate-800">Metas {selectedYear}</h2>
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">Planejamento</p>
              </div>
            </div>

            {/* Seletor de Ano scrollável horizontalmente no mobile */}
            <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm min-w-max mx-auto md:mx-0">
                {[2025, 2026, 2027].map((year) => (
                    <button
                    key={year}
                    onClick={() => setSelectedYear(year)}
                    className={`px-4 py-2 rounded-lg text-xs md:text-sm font-black transition-all ${
                        selectedYear === year 
                        ? 'bg-sky-700 text-white shadow-md' 
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                    >
                    {year}
                    </button>
                ))}
                </div>
            </div>
          </div>

          <div className="overflow-x-auto relative">
            {definitions.wards.length === 0 ? (
               <div className="p-12 text-center text-slate-500 font-bold text-sm">Carregando dados...</div>
            ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-100/50">
                  {/* Coluna Fixa (Sticky) com sombra lateral para indicar scroll */}
                  <th className="sticky left-0 bg-slate-50 z-20 p-4 text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-r border-slate-200 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.1)] w-[140px] md:w-[220px]">
                    Unidade
                  </th>
                  {definitions.indicators.map(ind => (
                    <th key={ind.id} className="p-4 text-[10px] md:text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 text-center align-bottom min-w-[120px]">
                      <div className="flex flex-col items-center gap-2">
                        {ICON_MAP[ind.slug]}
                        <span className="whitespace-normal max-w-[100px] leading-tight">{ind.display_name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Linha de Totais */}
                <tr className="bg-sky-50/30 border-b border-sky-100">
                  <td className="sticky left-0 bg-sky-50 z-10 p-4 border-r border-sky-200 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]">
                    <span className="font-black text-sky-800 uppercase text-[10px] md:text-xs tracking-wider">Total Estaca</span>
                  </td>
                  {definitions.indicators.map(ind => (
                    <td key={ind.id} className="p-4 text-center">
                      <span className="text-lg md:text-2xl font-black text-sky-900">
                        {stakeTotals[ind.id] || 0}
                      </span>
                    </td>
                  ))}
                </tr>

                {/* Linhas das Alas */}
                {definitions.wards.map(ward => (
                  <tr key={ward.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td className="sticky left-0 bg-white hover:bg-slate-50 z-10 p-4 font-bold text-slate-700 text-xs md:text-sm border-r border-slate-100 shadow-[4px_0_12px_-4px_rgba(0,0,0,0.05)]">
                      {ward.name}
                    </td>
                    {definitions.indicators.map(ind => (
                      <td key={ind.id} className="p-4 text-center font-bold text-slate-600 text-sm md:text-lg">
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

        {/* RODAPÉ */}
        <footer className="mt-8 py-8 border-t border-slate-200 text-center space-y-4 px-4">
          <p className="font-bold text-slate-400 uppercase text-[10px] tracking-widest">
            Sistema não oficial
          </p>
          <div className="flex justify-center opacity-30">
             <Church className="w-5 h-5 text-slate-400" />
          </div>
        </footer>

      </div>
    </main>
  )
}