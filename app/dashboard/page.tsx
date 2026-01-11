'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../lib/supabase/client'
import { 
  TrendingUp, Calendar, Users, UserPlus, Heart, Church, 
  Award, BookOpen, ChevronLeft, ChevronRight, Target,
  ArrowUpRight, ArrowDownRight, Minus
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

// Atualizado para suportar estrutura de dados complexa nos cards
type DashboardData = {
  id: string
  slug: string
  display_name: string
  value: number | string
  details?: {
    target?: number
    percent?: number
    subtitle?: string
    trend?: 'up' | 'down' | 'neutral'
    comparisonLabel?: string
    subValue?: string | number
  }
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

  // --- Helpers de Data (CORRIGIDOS v1.1.4) ---
  
  // Garante o início da semana no Domingo (00:00:00)
  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay(); // 0 = Domingo
    const diff = date.getDate() - day; // Recua para o domingo
    const sunday = new Date(date);
    sunday.setDate(diff);
    sunday.setHours(0, 0, 0, 0); // Zera hora para evitar problemas de cálculo
    return sunday;
  }

  // Lógica corrigida: Calcula semana baseada no Domingo da semana.
  // Se o domingo é em 2025, é semana de 2025. Se é em 2026, é semana de 2026.
  // Semana 1 = A semana do primeiro domingo do ano.
  const getCustomWeekNumber = (d: Date) => {
    const sunday = getStartOfWeek(d);
    const year = sunday.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    
    // Diferença em dias entre o Domingo atual e 1º de Jan
    const diffTime = sunday.getTime() - startOfYear.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // Cálculo simples: (Dias passados / 7) + 1
    return Math.floor(diffDays / 7) + 1;
  }

  // Lógica principal de processamento versão 1.1
  const processIndicatorLogic = (
    ind: Indicator, 
    allData: any[], 
    refDate: Date, 
    stakeTarget: number
  ): DashboardData => {
    const currentYear = refDate.getFullYear();
    const currentMonth = refDate.getMonth();
    
    // Filtra dados apenas do indicador atual
    const indData = allData.filter(d => d.indicator_id === ind.id);

    let mainValue = 0;
    let details: DashboardData['details'] = {};

    // Helper: Obter dados da semana selecionada
    const startOfWeekISO = getStartOfWeek(refDate).toISOString().split('T')[0];
    const endOfWeekISO = new Date(getStartOfWeek(refDate).getTime() + 6 * 86400000).toISOString().split('T')[0];

    // Helper: Obter último valor válido por unidade (Lógica de Snapshot)
    const getSnapshotSum = (maxDateISO: string) => {
      const latestByWard: Record<string, number> = {};
      indData.forEach(d => {
        if (d.week_start <= maxDateISO) {
          // Se já existe e a data deste registro é mais recente, substitui
          const existingDate = latestByWard[`date_${d.ward_id}`];
          if (!existingDate || d.week_start > existingDate) {
            latestByWard[`date_${d.ward_id}`] = d.week_start;
            latestByWard[d.ward_id] = Number(d.value) || 0;
          }
        }
      });
      return Object.values(latestByWard).reduce((a, b) => typeof b === 'number' ? a + b : a, 0);
    }

    switch (ind.slug) {
      // 1️⃣ Batismos de Conversos (Acumulativo Anual)
      case 'batismo_converso':
        // Soma tudo do ano até a data de referência
        mainValue = indData
          .filter(d => d.week_start <= endOfWeekISO && d.week_start.startsWith(String(currentYear)))
          .reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        
        details = {
          target: stakeTarget,
          percent: stakeTarget > 0 ? Math.round((mainValue / stakeTarget) * 100) : 0,
          subtitle: 'Acumulado no Ano'
        };
        break;

      // 2️⃣ Frequência da Reunião Sacramental (Semanal + Médias)
      case 'frequencia_sacramental':
        // Soma exata da semana selecionada
        mainValue = indData
          .filter(d => d.week_start >= startOfWeekISO && d.week_start <= endOfWeekISO)
          .reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        
        // Média do mês
        const monthData = indData.filter(d => {
            const dDate = new Date(d.week_start);
            return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear && d.week_start <= endOfWeekISO;
        });
        
        const weeklySums: Record<string, number> = {};
        monthData.forEach(d => {
            weeklySums[d.week_start] = (weeklySums[d.week_start] || 0) + Number(d.value);
        });
        
        const validWeeks = Object.values(weeklySums).filter(v => v > 0);
        const avgMonth = validWeeks.length > 0 
            ? Math.round(validWeeks.reduce((a, b) => a + b, 0) / validWeeks.length) 
            : 0;

        details = {
          subValue: avgMonth,
          comparisonLabel: 'Média do Mês',
          subtitle: 'Total da Semana'
        };
        break;

      // 3️⃣ Membros Jejuando (Mensal)
      case 'membros_jejuando':
        // Soma de todas as ofertas do mês atual até a data
        mainValue = indData
          .filter(d => {
             const dDate = new Date(d.week_start + 'T12:00:00'); // T12 evita timezone issues
             return dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear && d.week_start <= endOfWeekISO;
          })
          .reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        
        details = {
          target: stakeTarget > 0 ? Math.round(stakeTarget / 12) : 0, // Meta mensal aproximada
          percent: stakeTarget > 0 ? Math.round((mainValue / (stakeTarget/12)) * 100) : 0,
          subtitle: 'Total do Mês'
        };
        break;

      // 4️⃣ Membros Participantes (Snapshot)
      case 'membros_participantes':
      // 5️⃣ Membros Retornando (Snapshot)
      case 'membros_retornando_a_igreja':
      // 6️⃣ Missionários (Snapshot)
      case 'missionario_servindo_missao_do_brasil':
      // 7️⃣ Rec. Templo Com (Snapshot)
      case 'recomendacao_templo_com_investidura':
      // 8️⃣ Rec. Templo Sem (Snapshot)
      case 'recomendacao_templo_sem_investidura':
        
        // Valor atual (soma das últimas entradas de cada unidade)
        mainValue = getSnapshotSum(endOfWeekISO);

        // Para calcular tendência, pega o snapshot de 4 semanas atrás
        const prevDate = new Date(refDate);
        prevDate.setDate(prevDate.getDate() - 28);
        const prevValue = getSnapshotSum(prevDate.toISOString().split('T')[0]);

        details = {
          target: stakeTarget,
          subtitle: 'Posição Atual',
          trend: mainValue > prevValue ? 'up' : (mainValue < prevValue ? 'down' : 'neutral'),
          subValue: stakeTarget > 0 ? (mainValue - stakeTarget) : undefined, // Diferença
          comparisonLabel: stakeTarget > 0 ? 'Diferença da Meta' : 'vs Mês Anterior'
        };
        
        // Ajuste específico para missionários
        if (ind.slug === 'missionario_servindo_missao_do_brasil') {
            details.subValue = prevValue;
            details.comparisonLabel = 'Mês Anterior';
            details.target = undefined; 
        }
        break;

      default:
        mainValue = 0;
    }

    return {
      id: ind.id,
      slug: ind.slug,
      display_name: ind.display_name,
      value: mainValue,
      details: details
    };
  }

  const loadWeeklyData = useCallback(async (dateToLoad: Date) => {
    try {
      setLoading(true);
      
      const startOfYear = new Date(dateToLoad.getFullYear(), 0, 1).toISOString().split('T')[0];
      
      const sunday = getStartOfWeek(dateToLoad);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      const endOfWeekIso = saturday.toISOString().split('T')[0];

      // Exibição corrigida do número da semana
      const currentWeekNum = getCustomWeekNumber(dateToLoad);
      const currentYearLabel = sunday.getFullYear(); // Usa o ano do Domingo para consistência
      setWeekLabel(`Semana ${currentWeekNum} de ${currentYearLabel}`);

      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      
      // Busca dados expandidos
      const { data: rawData } = await supabase
        .from('weekly_indicator_data')
        .select('*')
        .gte('week_start', startOfYear)
        .lte('week_start', endOfWeekIso);

      if (indicators) {
        // Processa cada card usando a lógica inteligente V1.1
        const processedCards = indicators.map((ind: Indicator) => {
          const target = stakeTotals[ind.id] || 0;
          return processIndicatorLogic(ind, rawData || [], dateToLoad, target);
        });
        setMainCards(processedCards);
      }
    } catch (err) {
      console.error('Erro Bloco 1:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, stakeTotals]); 

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
      // AJUSTE SOLICITADO: Define a data de referência como HOJE
      // Isso força o sistema a calcular a semana atual baseada na data real do usuário
      setReferenceDate(new Date()); 
    }
    init();
  }, [loadDefinitions]); // supabase removido pois não é usado na inicialização simplificada

  useEffect(() => {
    if (referenceDate) {
        loadWeeklyData(referenceDate);
    }
  }, [referenceDate, stakeTotals, loadWeeklyData]);

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
  }

  const renderTrend = (trend?: 'up' | 'down' | 'neutral') => {
    if (trend === 'up') return <ArrowUpRight className="w-3 h-3 text-emerald-500" />;
    if (trend === 'down') return <ArrowDownRight className="w-3 h-3 text-rose-500" />;
    return <Minus className="w-3 h-3 text-slate-400" />;
  };

  return (
    <main className="w-full min-h-screen font-sans">
      <div className="w-full mx-auto space-y-6">
        
        {/* HEADER */}
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
            {/* Seletor de Data */}
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
              <div key={card.id} className="group bg-white p-3 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm hover:border-sky-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full min-h-[140px]">
                
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col">
                    <span className="text-[9px] md:text-xs font-black text-slate-500 uppercase tracking-wide leading-3 pr-1 line-clamp-3">
                        {card.display_name}
                    </span>
                    {card.details?.subtitle && (
                        <span className="text-[8px] md:text-[10px] text-slate-400 font-medium mt-1">
                            {card.details.subtitle}
                        </span>
                    )}
                  </div>
                  <div className="p-1.5 md:p-3 bg-slate-50 group-hover:bg-sky-50 rounded-lg md:rounded-2xl transition-colors shrink-0">
                    {ICON_MAP[card.slug]}
                  </div>
                </div>

                <div className="mt-auto">
                    <p className="text-2xl md:text-5xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors">
                    {card.value}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-2 border-t border-slate-50 pt-2">
                        {card.details?.target !== undefined && card.details.target > 0 && (
                            <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold text-slate-600">
                                <Target className="w-3 h-3" />
                                <span>{card.details.percent}% da Meta</span>
                            </div>
                        )}
                        
                        {(card.details?.subValue !== undefined || card.details?.trend) && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold text-slate-500">
                                {card.details.trend && renderTrend(card.details.trend)}
                                {card.details.subValue !== undefined && (
                                    <span>
                                        {card.details.subValue} <span className="text-[8px] font-normal opacity-70">{card.details.comparisonLabel}</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
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
                    <th key={ind.id} className="p-2 md:p-3 text-center align-bottom border-b border-slate-200 min-w-[70px] md:min-w-[100px]">
                      <div className="flex flex-col items-center justify-end w-full gap-1.5">
                        <div className="shrink-0">
                             {ICON_MAP[ind.slug]}
                        </div>
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

        {/* RODAPÉ INFORMATIVO (ATUALIZADO v1.1.4) */}
        <footer className="py-8 border-t border-slate-200 text-center opacity-50 space-y-2">
           <Church className="w-4 h-4 text-slate-400 mx-auto mb-2" />
           <p className="text-[10px] text-slate-500 font-medium">
             Este sistema não é um produto oficial da Igreja de Jesus Cristo dos Santos dos Últimos Dias.
           </p>
           <p className="text-[9px] text-slate-400 font-mono">
             Versão 1.1.5
           </p>
        </footer>
      </div>
    </main>
  )
}