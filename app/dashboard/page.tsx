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

// ⚠️ ATUALIZADO: Tipo expandido para suportar dados ricos da v1.1
type DashboardData = {
  id: string
  slug: string
  display_name: string
  value: number | string // Suporta formatação
  secondary?: string     // Nova linha de apoio (metas, médias)
  trend?: 'up' | 'down' | 'neutral'
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

  // --- Helpers de Data ---
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

  // --- Lógica v1.1: Processamento Avançado de Indicadores ---
  const processIndicatorLogic = (
    ind: Indicator, 
    allData: any[], 
    target: number, 
    currentDate: Date
  ): DashboardData => {
    const slug = ind.slug;
    
    // Filtrar dados para este indicador específico
    const rawData = allData.filter(d => d.indicator_id === ind.id);
    
    // Datas de referência
    const startOfCurrentYear = new Date(currentDate.getFullYear(), 0, 1);
    const currentMonthStr = currentDate.toISOString().slice(0, 7); // YYYY-MM
    const currentWeekStartIso = getStartOfWeek(currentDate).toISOString().split('T')[0];
    
    // Helpers de cálculo
    const getValue = (entry: any) => Number(entry?.value) || 0;
    
    // Obter dado da semana atual (para indicadores snapshot/semanais)
    const currentWeekEntry = rawData.find(d => d.week_start === currentWeekStartIso);
    const currentWeekValue = getValue(currentWeekEntry);

    // Estrutura base de retorno
    let result: DashboardData = {
      id: ind.id,
      slug: ind.slug,
      display_name: ind.display_name,
      value: 0,
      secondary: ''
    };

    switch (slug) {
      // 1️⃣ Batismos (Acumulativo Anual)
      case 'batismo_converso':
        const totalYTD = rawData
          .filter(d => d.week_start >= startOfCurrentYear.toISOString() && d.week_start <= currentWeekStartIso)
          .reduce((acc, curr) => acc + getValue(curr), 0);
        
        const percentBatismo = target > 0 ? Math.round((totalYTD / target) * 100) : 0;
        
        result.value = totalYTD;
        result.secondary = `Meta: ${target} (${percentBatismo}%)`;
        break;

      // 2️⃣ Frequência Sacramental (Semanal com Média)
      case 'frequencia_sacramental':
        // Média Anual (exclui zeros que representam conferências não reportadas ou reportadas como 0)
        const validWeeks = rawData.filter(d => 
          d.week_start >= startOfCurrentYear.toISOString() && 
          d.week_start <= currentWeekStartIso && 
          getValue(d) > 0
        );
        const avgYear = validWeeks.length > 0 
          ? Math.round(validWeeks.reduce((acc, c) => acc + getValue(c), 0) / validWeeks.length) 
          : 0;

        result.value = currentWeekValue; // Valor da semana selecionada
        result.secondary = `Média Ano: ${avgYear}`;
        break;

      // 3️⃣ Membros Jejuando (Acumulado do Mês)
      case 'membros_jejuando':
        const monthTotal = rawData
          .filter(d => d.week_start.startsWith(currentMonthStr))
          .reduce((acc, curr) => acc + getValue(curr), 0);
        
        // Meta anual convertida para meta mensal aproximada (meramente visual) ou meta anual total
        const percentJejum = target > 0 ? Math.round((monthTotal / (target / 12)) * 100) : 0;
        
        result.value = monthTotal;
        result.secondary = target > 0 ? `Meta Anual: ${target}` : 'Mensal';
        break;

      // 4️⃣, 5️⃣, 7️⃣, 8️⃣ Indicadores de "Estoque" (Snapshot Atual - Não zera)
      case 'membros_participantes':
      case 'membros_retornando_a_igreja':
      case 'recomendacao_templo_com_investidura':
      case 'recomendacao_templo_sem_investidura':
        // Pega o registro mais recente até a data selecionada (Estado Atual)
        const latestEntry = rawData
          .filter(d => d.week_start <= currentWeekStartIso)
          .sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime())[0];
        
        const stockValue = getValue(latestEntry);
        result.value = stockValue;
        
        if (slug === 'membros_participantes' && target > 0) {
           const diff = stockValue - target;
           result.secondary = `Meta: ${target} (${diff > 0 ? '+' : ''}${diff})`;
        } else if (slug.includes('recomendacao')) {
           // Calcular média simples do ano para comparação
           const allYearValues = rawData.filter(d => d.week_start >= startOfCurrentYear.toISOString()).map(getValue);
           const avg = allYearValues.length ? Math.round(allYearValues.reduce((a,b)=>a+b,0)/allYearValues.length) : 0;
           result.secondary = `Média Ano: ${avg}`;
        } else {
           // Membros retornando
           result.secondary = 'Total Ativo';
        }
        break;

      // 6️⃣ Missionários (Constante)
      case 'missionario_servindo_missao_do_brasil':
        // Busca o último valor reportado
        const lastMissionaryEntry = rawData
        .filter(d => d.week_start <= currentWeekStartIso)
        .sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime())[0];
        
        const currentMissionaries = getValue(lastMissionaryEntry);
        
        // Pico histórico no ano
        const peak = rawData
          .filter(d => d.week_start >= startOfCurrentYear.toISOString())
          .reduce((max, curr) => Math.max(max, getValue(curr)), 0);

        result.value = currentMissionaries;
        result.secondary = `Pico no Ano: ${peak}`;
        break;

      default:
        result.value = currentWeekValue;
    }

    return result;
  }

  const loadWeeklyData = useCallback(async (dateToLoad: Date) => {
    try {
      setLoading(true);
      const yearStart = new Date(dateToLoad.getFullYear(), 0, 1);
      const sunday = getStartOfWeek(dateToLoad);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);

      // Datas ISO
      const yearStartIso = yearStart.toISOString().split('T')[0];
      const endIso = saturday.toISOString().split('T')[0]; // Pegamos dados até o fim da semana selecionada
      
      setWeekLabel(`Semana ${getCustomWeekNumber(dateToLoad)} de ${dateToLoad.getFullYear()}`);

      // ⚠️ v1.1: Fetch de TODO o período do ano até agora, não apenas a semana
      // Isso permite calcular acumulados e médias no cliente sem mudar backend
      const { data: yearRawData } = await supabase
        .from('weekly_indicator_data')
        .select('*')
        .gte('week_start', yearStartIso)
        .lte('week_start', endIso);

      if (definitions.indicators) {
        const processedCards = definitions.indicators.map((ind: Indicator) => {
          // Busca a meta da estaca (soma das alas) para este indicador
          const stakeTarget = stakeTotals[ind.id] || 0;
          
          return processIndicatorLogic(
            ind, 
            yearRawData || [], 
            stakeTarget, 
            dateToLoad
          );
        });
        setMainCards(processedCards);
      }
    } catch (err) {
      console.error('Erro Bloco 1:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, definitions, stakeTotals]);

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

  // --- Efeitos ---
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
    }
    init();
  }, [supabase, loadDefinitions]);

  // Carrega metas quando ano muda
  useEffect(() => {
    if (definitions.wards.length > 0) {
      loadTargetsForYear(selectedYear);
    }
  }, [selectedYear, definitions, loadTargetsForYear]);

  // Carrega dados semanais quando Data ou Metas (para cálculo de %) estão prontos
  useEffect(() => {
    if (referenceDate && definitions.indicators.length > 0) {
        loadWeeklyData(referenceDate);
    }
  }, [referenceDate, definitions, stakeTotals, loadWeeklyData]);


  const changeWeek = (offset: number) => {
    if (!referenceDate) return;
    const newDate = new Date(referenceDate);
    newDate.setDate(newDate.getDate() + (offset * 7));
    setReferenceDate(newDate);
    // loadWeeklyData é chamado pelo useEffect dependente de referenceDate
  }

  return (
    <main className="w-full min-h-screen font-sans">
      <div className="w-full mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="pt-2 pb-4 text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight" style={{ color: COLORS.title }}>
            Dashboard
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mt-1">
            Gestão de Indicadores v1.1
          </p>
        </header>

        {/* BLOCO 1: RESULTADOS */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden p-4 md:p-8 transition-all">
          
          <div className="flex flex-col md:flex-row items-center justify-between mb-4 md:mb-6 gap-4 border-b border-slate-100 pb-4">
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

          {/* GRID INTELIGENTE */}
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 ${loading ? 'opacity-50' : ''}`}>
            {mainCards.map((card) => (
              <div key={card.id} className="group bg-white p-3 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm hover:border-sky-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full min-h-[120px]">
                
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-wide leading-3 pr-1 line-clamp-3">
                    {card.display_name}
                  </span>
                  <div className="p-1.5 md:p-3 bg-slate-50 group-hover:bg-sky-50 rounded-lg md:rounded-2xl transition-colors shrink-0">
                    {ICON_MAP[card.slug]}
                  </div>
                </div>

                {/* Conteúdo Valor + Secundário */}
                <div className="mt-auto">
                    <p className="text-2xl md:text-5xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors">
                      {card.value}
                    </p>
                    
                    {/* ⚠️ ADIÇÃO v1.1: Campo secundário para contexto (Meta, Média, etc) */}
                    {card.secondary && (
                        <div className="flex items-center gap-1 mt-1">
                            {/* Pequeno indicador visual ou apenas texto */}
                            <span className="text-[10px] md:text-xs font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                {card.secondary}
                            </span>
                        </div>
                    )}
                </div>

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