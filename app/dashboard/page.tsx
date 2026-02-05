'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '../../lib/supabase/client'
import { 
  TrendingUp, Calendar, Users, UserPlus, Heart, Church, 
  Award, BookOpen, ChevronLeft, ChevronRight, Target,
  ArrowUpRight, ArrowDownRight, Minus, Trophy, AlertCircle,
  Search, BarChart3
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
  membership_count: number | null
}

type Period = '30d' | '90d' | '12m';

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
  // Novo estado para armazenar dados brutos e permitir recalculo do Bloco 3 sem fetch
  const [cachedRawData, setCachedRawData] = useState<any[]>([]) 
  
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('30d')
  
  // Novo Estado: Unidade Selecionada para o Bloco 3
  const [selectedWardId, setSelectedWardId] = useState<string>('')

  const [selectedYear, setSelectedYear] = useState(2026) 
  const [definitions, setDefinitions] = useState<{wards: Ward[], indicators: Indicator[]}>({ wards: [], indicators: [] })
  
  const [targetMatrix, setTargetMatrix] = useState<Record<string, Record<string, number>>>({})
  const [stakeTotals, setStakeTotals] = useState<Record<string, number>>({})

  // --- Lógica de Datas ---
  const getDateRange = (period: Period) => {
    const end = new Date();
    const start = new Date();
    
    if (period === '30d') start.setDate(end.getDate() - 30);
    if (period === '90d') start.setDate(end.getDate() - 90);
    if (period === '12m') start.setMonth(end.getMonth() - 12);
    
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
    
    return { start, end };
  }

  // --- Ranking (Bloco 1) ---
  const calculateRanking = (indId: string, allData: any[], wards: Ward[], periodStart: Date, periodEnd: Date, type: 'sum' | 'avg' | 'snapshot') => {
    let bestWard = { name: '-', score: -1, value: 0 };
    let worstWard = { name: '-', score: 9999999, value: 0 };

    wards.forEach(ward => {
      const wardData = allData.filter(d => 
        d.indicator_id === indId && d.ward_id === ward.id &&
        new Date(d.week_start) >= periodStart && new Date(d.week_start) <= periodEnd
      );

      let value = 0;
      if (wardData.length > 0) {
        if (type === 'sum') {
          value = wardData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        } else if (type === 'avg') {
           const sum = wardData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
           value = Math.round(sum / wardData.length);
        } else if (type === 'snapshot') {
          const sorted = wardData.sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
          value = Number(sorted[0].value) || 0;
        }
      }

      const members = ward.membership_count && ward.membership_count > 0 ? ward.membership_count : 1; 
      const score = (value / members) * 1000;

      if (score > bestWard.score) bestWard = { name: ward.name, score, value };
      if (score < worstWard.score) worstWard = { name: ward.name, score, value };
    });

    if (bestWard.score === -1) bestWard = { name: '-', score: 0, value: 0 };
    if (worstWard.score === 9999999) worstWard = { name: '-', score: 0, value: 0 };

    return { best: bestWard, worst: worstWard };
  }

  // --- Processamento Bloco 1 ---
  const processPeriodLogic = (ind: Indicator, allData: any[], wards: Ward[], period: Period): DashboardData => {
    const { start, end } = getDateRange(period);
    const periodData = allData.filter(d => {
      const dDate = new Date(d.week_start);
      return d.indicator_id === ind.id && dDate >= start && dDate <= end;
    });

    let mainValue = 0;
    let subtitle = '';
    let calcType: 'sum' | 'avg' | 'snapshot' = 'sum';

    switch (ind.slug) {
      case 'frequencia_sacramental':
        calcType = 'avg';
        subtitle = `Média (${period})`;
        const weeklySums: Record<string, number> = {};
        periodData.forEach(d => { weeklySums[d.week_start] = (weeklySums[d.week_start] || 0) + Number(d.value); });
        const weeks = Object.values(weeklySums);
        mainValue = weeks.length > 0 ? Math.round(weeks.reduce((a,b)=>a+b,0) / weeks.length) : 0;
        break;
      case 'batismo_converso':
      case 'membros_jejuando':
        calcType = 'sum';
        subtitle = `Total (${period})`;
        mainValue = periodData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
        break;
      default:
        calcType = 'snapshot';
        subtitle = 'Atual';
        const latestByWard: Record<string, {date: string, value: number}> = {};
        periodData.forEach(d => {
           const current = latestByWard[d.ward_id];
           if (!current || d.week_start > current.date) {
              latestByWard[d.ward_id] = { date: d.week_start, value: Number(d.value) };
           }
        });
        mainValue = Object.values(latestByWard).reduce((acc, item) => acc + item.value, 0);
    }

    const ranking = calculateRanking(ind.id, allData, wards, start, end, calcType);

    return {
      id: ind.id,
      slug: ind.slug,
      display_name: ind.display_name,
      value: mainValue,
      details: {
        subtitle,
        bestWard: ranking.best.name,
        bestValue: ranking.best.value,
        worstWard: ranking.worst.name,
        worstValue: ranking.worst.value
      }
    };
  }

  // --- Processamento Bloco 3 (Raio-X da Unidade) ---
  const getWardMetrics = () => {
    if (!selectedWardId || definitions.indicators.length === 0) return [];
    
    const { start, end } = getDateRange(selectedPeriod);

    return definitions.indicators.map(ind => {
      const wardData = cachedRawData.filter(d => 
        d.indicator_id === ind.id && 
        d.ward_id === selectedWardId &&
        new Date(d.week_start) >= start &&
        new Date(d.week_start) <= end
      );

      let value = 0;
      // Reutiliza lógica de cálculo (Soma/Média/Snapshot)
      if (ind.slug === 'frequencia_sacramental') {
          const sum = wardData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
          value = wardData.length > 0 ? Math.round(sum / wardData.length) : 0;
      } else if (['batismo_converso', 'membros_jejuando'].includes(ind.slug)) {
          value = wardData.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
      } else {
          // Snapshot
          const sorted = wardData.sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
          value = sorted.length > 0 ? Number(sorted[0].value) : 0;
      }

      // Meta Anual
      const target = targetMatrix[selectedWardId]?.[ind.id] || 0;
      // Diferença (Meta - Valor). Se for snapshot, é simples. Se for soma, é quanto falta pra meta anual.
      // Se a meta é 0, não tem gap. Se Valor > Meta, gap é 0.
      const gap = target > 0 ? Math.max(0, target - value) : 0;
      const progress = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

      return {
        ...ind,
        value,
        target,
        gap,
        progress
      };
    });
  }

  // --- Carregamento ---
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange(selectedPeriod);
      const startIso = start.toISOString().split('T')[0];
      const endIso = end.toISOString().split('T')[0];

      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      
      const { data: rawData } = await supabase
        .from('weekly_indicator_data')
        .select('*')
        .gte('week_start', startIso)
        .lte('week_start', endIso);
      
      setCachedRawData(rawData || []); // Cache para uso no Bloco 3

      if (indicators && definitions.wards.length > 0) {
        const processedCards = indicators.map((ind: Indicator) => {
          return processPeriodLogic(ind, rawData || [], definitions.wards, selectedPeriod);
        });
        setMainCards(processedCards);
      }
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedPeriod, definitions.wards]); 

  const loadDefinitions = useCallback(async () => {
    try {
      const { data: indicators } = await supabase.from('indicators').select('*').order('order_index');
      const { data: wards } = await supabase.from('wards').select('id, name, membership_count').order('name');
      
      if (indicators && wards) {
        setDefinitions({ wards, indicators });
        if (wards.length > 0) setSelectedWardId(wards[0].id); // Seleciona primeira ala por padrão
      }
    } catch (err) {
      console.error('Erro:', err);
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
          if (totals[iId] !== undefined) totals[iId] += val;
        });
      }
      setTargetMatrix(matrix);
      setStakeTotals(totals);
    } catch (err) { console.error('Erro metas:', err); }
  }, [supabase, definitions]); 

  // Efeitos
  useEffect(() => { loadDefinitions(); }, [loadDefinitions]);
  useEffect(() => { 
    if (definitions.wards.length > 0) loadData(); 
  }, [selectedPeriod, definitions.wards, loadData]);
  useEffect(() => {
    if (definitions.wards.length > 0) loadTargetsForYear(selectedYear);
  }, [selectedYear, definitions, loadTargetsForYear]);


  // Calculo derivado para Bloco 3
  const wardMetrics = getWardMetrics();

  return (
    <main className="w-full min-h-screen font-sans">
      <div className="w-full mx-auto space-y-8">
        
        {/* HEADER */}
        <header className="pt-2 pb-4 text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight" style={{ color: COLORS.title }}>
            Dashboard
          </h1>
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mt-1">
            Análise & Performance
          </p>
        </header>

        {/* BLOCO 1: RESULTADOS DA ESTACA */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden p-4 md:p-8">
          <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4 border-b border-slate-100 pb-4">
             <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-sky-600" />
                <h2 className="text-lg font-black text-slate-700">Visão Geral da Estaca</h2>
             </div>
             {/* Filtro Global de Período */}
             <div className="flex p-1 bg-slate-100 rounded-xl overflow-hidden">
               {(['30d', '90d', '12m'] as Period[]).map((p) => (
                 <button
                   key={p}
                   onClick={() => setSelectedPeriod(p)}
                   className={`px-4 py-2 rounded-lg text-xs md:text-sm font-black transition-all ${
                     selectedPeriod === p ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                   }`}
                 >
                   {p === '30d' ? '30 Dias' : p === '90d' ? '90 Dias' : '12 Meses'}
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
                    <span className="text-[8px] md:text-[10px] text-slate-400 font-medium mt-1">
                        {card.details?.subtitle}
                    </span>
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
                      <span className="text-[9px] font-bold text-slate-700 truncate" title={card.details?.bestWard}>
                        {card.details?.bestWard || '-'}
                      </span>
                      <span className="text-[9px] text-slate-400">{card.details?.bestValue}</span>
                   </div>
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

        {/* BLOCO 3: RAIO-X DA UNIDADE (NOVO) */}
        <section className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm md:shadow-xl overflow-hidden">
           <div className="p-4 md:p-8 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                 <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Search className="w-5 h-5" />
                 </div>
                 <h2 className="text-lg md:text-xl font-black text-slate-800">Raio-X da Unidade</h2>
              </div>
              
              {/* Dropdown de Unidade e Filtro de Período (Replica Visual) */}
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                 <select 
                    value={selectedWardId}
                    onChange={(e) => setSelectedWardId(e.target.value)}
                    className="bg-white border border-slate-300 text-slate-700 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2.5 font-bold"
                 >
                    {definitions.wards.map(w => (
                       <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                 </select>

                 <div className="flex p-1 bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {(['30d', '90d', '12m'] as Period[]).map((p) => (
                        <button
                        key={p}
                        onClick={() => setSelectedPeriod(p)}
                        className={`px-3 py-1.5 rounded-md text-[10px] md:text-xs font-black transition-all ${
                            selectedPeriod === p ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'
                        }`}
                        >
                        {p}
                        </button>
                    ))}
                 </div>
              </div>
           </div>

           <div className="p-4 md:p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 {wardMetrics.map((metric) => (
                    <div key={metric.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100 relative overflow-hidden">
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

                       {/* Barra de Progresso */}
                       <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2">
                          <div 
                             className={`h-1.5 rounded-full ${metric.progress >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} 
                             style={{ width: `${metric.progress}%` }}
                          ></div>
                       </div>
                       
                       <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className={`${metric.progress >= 100 ? 'text-emerald-600' : 'text-sky-600'}`}>
                             {metric.progress}% Concluído
                          </span>
                          {metric.target > 0 && metric.gap > 0 ? (
                             <span className="text-rose-500">Faltam {metric.gap}</span>
                          ) : (
                             metric.target > 0 && <span className="text-emerald-500">Meta Batida!</span>
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

        {/* BLOCO 2: METAS (MANTIDO) */}
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
             Versão 1.3.1
           </p>
        </footer>
      </div>
    </main>
  )
}