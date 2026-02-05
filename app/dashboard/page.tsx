'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../lib/supabase/client'
import { 
  TrendingUp, Calendar, Users, UserPlus, Heart, Church, 
  Award, BookOpen, ChevronLeft, ChevronRight, Target,
  ArrowUpRight, ArrowDownRight, Minus, Trophy, AlertCircle
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
  membership_count: number | null // Campo novo
}

type Period = '30d' | '90d' | '12m';

// Tipagem atualizada para o Dashboard v1.3
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
    // Campos de Ranking
    bestWard?: string
    bestValue?: number
    worstWard?: string
    worstValue?: number
  }
}

const COLORS = {
  primary: '#006184',
  secondary: '#105970',
  title: '#0e4f66',
  background: '#f8fafc',
}

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
  
  // Estado novo: Seletor de Período
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d')

  const [selectedYear, setSelectedYear] = useState(2026) 
  const [definitions, setDefinitions] = useState<{wards: Ward[], indicators: Indicator[]}>({ wards: [], indicators: [] })
  
  const [targetMatrix, setTargetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [stakeTotals, setStakeTotals] = useState<Record<string, number>>({})

  // --- Lógica de Datas v1.3 ---
  const getDateRange = (period: Period) => {
    const end = new Date(); // Hoje
    const start = new Date();
    
    if (period === '30d') start.setDate(end.getDate() - 30);
    if (period === '90d') start.setDate(end.getDate() - 90);
    if (period === '12m') start.setMonth(end.getMonth() - 12);
    
    // Ajusta horas para pegar o dia inteiro
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    
    return { start, end };
  }

  // --- Função Auxiliar: Ranking de Unidades ---
  const calculateRanking = (
    indId: string, 
    allData: any[], 
    wards: Ward[], 
    periodStart: Date, 
    periodEnd: Date,
    type: 'sum' | 'avg' | 'snapshot'
  ) => {
    let bestWard = { name: '-', score: -1, value: 0 };
    let worstWard = { name: '-', score: 9999999, value: 0 };

    wards.forEach(ward => {
      // 1. Filtra dados da unidade dentro do período
      const wardData = allData.filter(d => 
        d.indicator_id === indId && 
        d.ward_id === ward.id &&
        new Date(d.week_start) >= periodStart &&
        new Date(d.week_start) <= periodEnd
      );

      let value = 0;

      // 2. Calcula valor absoluto da unidade
      if (wardData.length > 0) {
        if (type === 'sum') {
          value = wardData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        } else if (type === 'avg') {
           const sum = wardData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
           value = Math.round(sum / wardData.length);
        } else if (type === 'snapshot') {
          // Pega o registro mais recente (ordena por data decrescente)
          const sorted = wardData.sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
          value = Number(sorted[0].value) || 0;
        }
      }

      // 3. Calcula Score Proporcional (Valor / Membros * 1000)
      // Se não tiver contagem de membros, usa 1 para evitar divisão por zero
      const members = ward.membership_count && ward.membership_count > 0 ? ward.membership_count : 1; 
      const score = (value / members) * 1000;

      // 4. Define Campeão e Alerta
      // Só considera para ranking se teve algum valor (para não penalizar quem não lançou dados ainda como "pior" se todos forem 0)
      if (score > bestWard.score) {
          bestWard = { name: ward.name, score, value };
      }
      // Para o pior, queremos alguém que tenha dados mas performance baixa, ou 0 mesmo.
      if (score < worstWard.score) {
          worstWard = { name: ward.name, score, value };
      }
    });

    // Limpeza caso não encontre dados
    if (bestWard.score === -1) bestWard = { name: '-', score: 0, value: 0 };
    if (worstWard.score === 9999999) worstWard = { name: '-', score: 0, value: 0 };

    return { best: bestWard, worst: worstWard };
  }

  // --- Lógica Principal de Processamento v1.3 ---
  const processPeriodLogic = (
    ind: Indicator, 
    allData: any[], 
    wards: Ward[],
    period: Period
  ): DashboardData => {
    const { start, end } = getDateRange(period);
    
    // Filtra dados globais do indicador dentro do período
    const periodData = allData.filter(d => {
      const dDate = new Date(d.week_start);
      return d.indicator_id === ind.id && dDate >= start && dDate <= end;
    });

    let mainValue = 0;
    let subtitle = '';
    let calcType: 'sum' | 'avg' | 'snapshot' = 'sum';

    // Definição da lógica de agregação por indicador
    switch (ind.slug) {
      case 'frequencia_sacramental':
        calcType = 'avg';
        subtitle = `Média (${period})`;
        // Média da Estaca: Primeiro soma todas as alas por semana, depois tira média das semanas
        const weeklySums: Record<string, number> = {};
        periodData.forEach(d => {
            weeklySums[d.week_start] = (weeklySums[d.week_start] || 0) + Number(d.value);
        });
        const weeks = Object.values(weeklySums);
        mainValue = weeks.length > 0 ? Math.round(weeks.reduce((a,b)=>a+b,0) / weeks.length) : 0;
        break;

      case 'batismo_converso':
        calcType = 'sum';
        subtitle = `Total (${period})`;
        mainValue = periodData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        break;

      case 'membros_jejuando':
         calcType = 'sum'; 
         subtitle = `Total (${period})`;
         mainValue = periodData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
         break;

      default:
        // Indicadores de Estoque/Snapshot (Pega o último valor conhecido de cada ala e soma)
        calcType = 'snapshot';
        subtitle = 'Atual';
        
        // Mapa para guardar o último valor de cada ala
        const latestByWard: Record<string, {date: string, value: number}> = {};
        
        periodData.forEach(d => {
           const current = latestByWard[d.ward_id];
           // Se não tem registro ou o registro atual é mais novo, atualiza
           if (!current || d.week_start > current.date) {
              latestByWard[d.ward_id] = { date: d.week_start, value: Number(d.value) };
           }
        });
        
        // Soma os últimos valores de cada ala
        mainValue = Object.values(latestByWard).reduce((acc, item) => acc + item.value, 0);
    }

    // Calcula Ranking
    const ranking = calculateRanking(ind.id, allData, wards, start, end, calcType);

    return {
      id: ind.id,
      slug: ind.slug,
      display_name: ind.display_name,
      value: mainValue,
      details: {
        subtitle: subtitle,
        bestWard: ranking.best.name,
        bestValue: ranking.best.value,
        worstWard: ranking.worst.name,
        worstValue: ranking.worst.value
      }
    };
  }

  // --- Carregamento de Dados ---
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const { start, end } = getDateRange(selectedPeriod);
      // Converte para string ISO YYYY-MM-DD para o Supabase
      const startIso = start.toISOString().split('T')[0];
      const endIso = end.toISOString().split('T')[0];

      // Busca Indicadores
      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      
      // Busca Dados Semanais (Raw Data)
      const { data: rawData } = await supabase
        .from('weekly_indicator_data')
        .select('*')
        .gte('week_start', startIso)
        .lte('week_start', endIso);

      if (indicators && definitions.wards.length > 0) {
        // Processa os cards com a nova lógica
        const processedCards = indicators.map((ind: Indicator) => {
          return processPeriodLogic(ind, rawData || [], definitions.wards, selectedPeriod);
        });
        setMainCards(processedCards);
      }
    } catch (err) {
      console.error('Erro ao carregar dados v1.3:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedPeriod, definitions.wards]); 

  const loadDefinitions = useCallback(async () => {
    try {
      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      // Importante: Busca a coluna membership_count agora
      const { data: wards } = await supabase.from('wards').select('id, name, membership_count').order('name');
      
      if (indicators && wards) {
        setDefinitions({ wards, indicators });
      }
    } catch (err) {
      console.error('Erro ao carregar definições:', err);
    }
  }, [supabase]);

  // Mantido Bloco 2: Metas (Sem alterações na lógica de metas)
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
      console.error('Erro processamento metas:', err);
    }
  }, [supabase, definitions]); 

  // Inicialização
  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  // Efeito para carregar dados do Dashboard quando mudar período ou tiver definições
  useEffect(() => {
    if (definitions.wards.length > 0) {
      loadData();
    }
  }, [selectedPeriod, definitions.wards, loadData]);

  // Efeito para carregar metas
  useEffect(() => {
    if (definitions.wards.length > 0) {
      loadTargetsForYear(selectedYear);
    }
  }, [selectedYear, definitions, loadTargetsForYear]);


  return (
    <main className="w-full min-h-screen font-sans">
      <div className="w-full mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="pt-2 pb-4 text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight" style={{ color: COLORS.title }}>
            Dashboard
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mt-1">
            Análise & Performance
          </p>
        </header>

        {/* BLOCO 1: RESULTADOS (Com Lógica v1.3) */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden p-4 md:p-8 transition-all">
          
          <div className="flex flex-col md:flex-row items-center justify-between mb-4 md:mb-6 gap-4 border-b border-slate-100 pb-4">
            {/* SELETOR DE PERÍODO (Substitui setas de data) */}
            <div className="flex p-1 bg-slate-100 rounded-xl overflow-hidden">
               {(['30d', '90d', '12m'] as Period[]).map((p) => (
                 <button
                   key={p}
                   onClick={() => setSelectedPeriod(p)}
                   className={`px-4 py-2 rounded-lg text-xs md:text-sm font-black transition-all ${
                     selectedPeriod === p 
                     ? 'bg-white text-sky-700 shadow-sm scale-100' 
                     : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 scale-95'
                   }`}
                 >
                   {p === '30d' ? '30 Dias' : p === '90d' ? '90 Dias' : '12 Meses'}
                 </button>
               ))}
            </div>
          </div>

          {/* GRID DE CARDS */}
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6 ${loading ? 'opacity-50' : ''}`}>
            {mainCards.map((card) => (
              <div key={card.id} className="group bg-white p-3 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm hover:border-sky-200 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full min-h-[160px]">
                
                {/* Cabeçalho do Card */}
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

                {/* Valor Principal */}
                <div className="mt-2 mb-2">
                    <p className="text-2xl md:text-4xl font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors">
                    {card.value}
                    </p>
                </div>

                {/* RANKING (BEST / WORST) */}
                <div className="mt-auto pt-3 border-t border-slate-50 grid grid-cols-2 gap-2">
                   {/* Destaque */}
                   <div className="flex flex-col">
                      <div className="flex items-center gap-1 mb-0.5">
                         <Trophy className="w-3 h-3 text-amber-500" />
                         <span className="text-[8px] font-bold text-slate-400 uppercase">Destaque</span>
                      </div>
                      <span className="text-[9px] font-bold text-slate-700 truncate" title={card.details?.bestWard}>
                        {card.details?.bestWard || '-'}
                      </span>
                      <span className="text-[9px] text-slate-400">{card.details?.bestValue}</span>
                   </div>

                   {/* Atenção */}
                   <div className="flex flex-col border-l border-slate-50 pl-2">
                      <div className="flex items-center gap-1 mb-0.5">
                         <AlertCircle className="w-3 h-3 text-rose-400" />
                         <span className="text-[8px] font-bold text-slate-400 uppercase">Atenção</span>
                      </div>
                      <span className="text-[9px] font-bold text-slate-700 truncate" title={card.details?.worstWard}>
                        {card.details?.worstWard || '-'}
                      </span>
                      <span className="text-[9px] text-slate-400">{card.details?.worstValue}</span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BLOCO 2: METAS (MANTIDO INTACTO) */}
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

        <footer className="py-8 border-t border-slate-200 text-center opacity-50 space-y-2">
           <Church className="w-4 h-4 text-slate-400 mx-auto mb-2" />
           <p className="text-[10px] text-slate-500 font-medium">
             Este sistema não é um produto oficial da Igreja de Jesus Cristo dos Santos dos Últimos Dias.
           </p>
           <p className="text-[9px] text-slate-400 font-mono">
             Versão 1.3.0
           </p>
        </footer>
      </div>
    </main>
  )
}