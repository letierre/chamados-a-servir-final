'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '../../lib/supabase/client'
import { 
  History, Calendar, Hash, Building2, Target, 
  ChevronLeft, ChevronRight, Clock, Loader2,
  X, Check, ChevronDown, Edit2, Trash2, Save, AlertTriangle, Filter, Search
} from 'lucide-react'

// --- CONFIGURAÇÃO VISUAL ---
const THEME = {
  primary: '#0069a8',
  primaryLight: '#e0f2fe',
  textTitle: '#157493',
  bg: '#f1f5f9',
  card: '#ffffff',
  border: '#e2e8f0'
}

// --- HELPERS ---
function getWeekNumber(d: Date) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(( ( (date.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
    return { week: weekNo, year: date.getUTCFullYear() };
}

// --- TYPES ---
type HistoryEntry = {
  id: string
  value: number
  week_start: string
  created_at: string
  wards: { id: string, name: string }
  indicators: { id: string, display_name: string }
}

type DateRange = {
  start: string
  end: string
}

export default function HistoricoPage() {
  const supabase = createClient()
  
  // Estados de Dados
  const [data, setData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  
  // Opções de Filtro (Carregadas do Banco)
  const [filterOptions, setFilterOptions] = useState<{
    wards: {id: string, name: string}[], 
    indicators: {id: string, display_name: string}[], 
    weeks: {date: string, label: string}[]
  }>({ wards: [], indicators: [], weeks: [] })

  // Filtros Ativos
  const [selectedWards, setSelectedWards] = useState<string[]>([])
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([])
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>('') 
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' })

  // UI Control
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false) // Controle do painel mobile
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState<HistoryEntry | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [editForm, setEditForm] = useState({ value: 0, week_start: '' })

  // Helper para fechar dropdowns ao clicar fora (opcional, simplificado aqui pelo controle de estado)
  const toggleDropdown = (name: string) => {
    if (activeDropdown === name) setActiveDropdown(null)
    else setActiveDropdown(name)
  }

  // --- CARGA DE OPÇÕES ---
  useEffect(() => {
    async function loadOptions() {
      const [w, i, weeksRes] = await Promise.all([
        supabase.from('wards').select('id, name').order('name'),
        supabase.from('indicators').select('id, display_name').order('display_name'),
        supabase.from('weekly_indicator_data').select('week_start').order('week_start', { ascending: false })
      ])

      // Lógica Melhorada para Semanas Únicas:
      // Agrupa por Rótulo (ex: "Semana 1 (2026)") para evitar duplicatas visuais
      const distinctWeeksMap = new Map();
      weeksRes.data?.forEach(item => {
        const { week, year } = getWeekNumber(new Date(item.week_start + 'T12:00:00'));
        const label = `Semana ${week} (${year})`;
        // Se já existe esse rótulo, não sobrescreve (mantém a data mais recente ou a primeira encontrada)
        if (!distinctWeeksMap.has(label)) {
          distinctWeeksMap.set(label, { date: item.week_start, label });
        }
      });
      
      const uniqueWeeks = Array.from(distinctWeeksMap.values());

      setFilterOptions({ wards: w.data || [], indicators: i.data || [], weeks: uniqueWeeks })
    }
    loadOptions()
  }, [supabase])

  // --- BUSCA COM NOVOS FILTROS ---
  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('weekly_indicator_data')
        .select(`id, value, week_start, created_at, wards!inner(id, name), indicators!inner(id, display_name)`, { count: 'exact' })
      
      // Filtro Unidade (Multi)
      if (selectedWards.length > 0) query = query.in('ward_id', selectedWards)
      
      // Filtro Indicador (Multi)
      if (selectedIndicators.length > 0) query = query.in('indicator_id', selectedIndicators)
      
      // Filtro Semana (Único)
      if (selectedWeekDate) query = query.eq('week_start', selectedWeekDate)

      // Filtro Data Lançamento (Range)
      if (dateRange.start) query = query.gte('created_at', `${dateRange.start}T00:00:00`)
      if (dateRange.end) query = query.lte('created_at', `${dateRange.end}T23:59:59`)
      
      const { data: res, count } = await query
        .order('week_start', { ascending: false })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)

      setData(res as any || [])
      setTotalCount(count || 0)
    } finally {
      setLoading(false)
    }
  }, [supabase, page, pageSize, selectedWards, selectedIndicators, selectedWeekDate, dateRange])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  // --- ACTIONS ---
  const handleUpdate = async () => {
    if (!editingRow) return
    setActionLoading(true)
    const { error } = await supabase.from('weekly_indicator_data')
      .update({ value: editForm.value, week_start: editForm.week_start })
      .eq('id', editingRow.id)
    
    if (!error) {
      await fetchHistory()
      setIsEditModalOpen(false)
    }
    setActionLoading(false)
  }

  const handleDelete = async () => {
    if (!editingRow) return
    setActionLoading(true)
    const { error } = await supabase.from('weekly_indicator_data').delete().eq('id', editingRow.id)
    if (!error) {
      await fetchHistory()
      setIsEditModalOpen(false)
    }
    setActionLoading(false)
  }

  // Helper para limpar tudo
  const clearFilters = () => {
    setSelectedWards([])
    setSelectedIndicators([])
    setSelectedWeekDate('')
    setDateRange({ start: '', end: '' })
  }

  const hasActiveFilters = selectedWards.length > 0 || selectedIndicators.length > 0 || selectedWeekDate || dateRange.start || dateRange.end;

  // --- SUB-COMPONENTES DE FILTRO (Visual) ---
  const CheckboxItem = ({ label, checked, onClick }: { label: string, checked: boolean, onClick: () => void }) => (
    <div onClick={onClick} className="flex items-center gap-3 p-2.5 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${checked ? 'bg-sky-600 border-sky-600' : 'border-slate-300 group-hover:border-sky-400'}`}>
        {checked && <Check size={10} className="text-white" />}
      </div>
      <span className={`text-xs font-medium ${checked ? 'text-sky-700 font-bold' : 'text-slate-600'}`}>{label}</span>
    </div>
  )

  return (
    <main className="min-h-screen p-4 md:p-8 lg:p-12" style={{ backgroundColor: THEME.bg }}>
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-200">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">Histórico</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                {totalCount} Registros
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* BOTÃO FILTROS MOBILE */}
            <div className="md:hidden w-full">
               <button 
                  onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                  className={`flex items-center justify-between w-full border text-xs font-bold rounded-xl px-4 py-3 transition-all ${hasActiveFilters ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
               >
                  <div className="flex items-center gap-2">
                    <Filter size={14} />
                    {hasActiveFilters ? 'Filtros Ativos' : 'Filtrar Dados'}
                  </div>
                  {mobileFiltersOpen ? <ChevronDown size={14} className="rotate-180 transition-transform"/> : <ChevronDown size={14} className="transition-transform"/>}
               </button>
            </div>

            {hasActiveFilters && (
              <button 
                onClick={clearFilters}
                className="hidden md:block text-xs font-bold text-rose-500 hover:bg-rose-50 px-4 py-2.5 rounded-xl transition-all border border-transparent hover:border-rose-100"
              >
                Limpar Filtros
              </button>
            )}
            
            <div className="h-10 w-px bg-slate-200 hidden md:block mx-2"></div>
            
            <select 
              value={pageSize} 
              onChange={e => setPageSize(Number(e.target.value))}
              className="flex-1 md:flex-none bg-slate-50 border-slate-200 text-slate-600 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value={15}>15 / pág</option>
              <option value={50}>50 / pág</option>
              <option value={100}>100 / pág</option>
            </select>
          </div>
        </div>

        {/* --- ÁREA DE FILTROS MOBILE (EXPANSÍVEL) --- */}
        {mobileFiltersOpen && (
          <div className="md:hidden bg-white p-5 rounded-3xl shadow-lg border border-slate-100 space-y-5 animate-in slide-in-from-top-2">
            
            {/* Filtro Semana */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Semana de Referência</label>
              <select 
                value={selectedWeekDate}
                onChange={(e) => setSelectedWeekDate(e.target.value)}
                className="w-full bg-slate-50 border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none"
              >
                <option value="">Todas as Semanas</option>
                {filterOptions.weeks.map(w => (
                  <option key={w.date} value={w.date}>{w.label}</option>
                ))}
              </select>
            </div>

            {/* Filtro Unidade (Multi-Mobile Simulado) */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidades ({selectedWards.length})</label>
              <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                {filterOptions.wards.map(ward => (
                  <CheckboxItem 
                    key={ward.id} 
                    label={ward.name} 
                    checked={selectedWards.includes(ward.id)}
                    onClick={() => {
                      setSelectedWards(prev => prev.includes(ward.id) ? prev.filter(id => id !== ward.id) : [...prev, ward.id])
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Filtro Indicador (Multi-Mobile Simulado) */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Indicadores ({selectedIndicators.length})</label>
              <div className="max-h-32 overflow-y-auto border border-slate-100 rounded-xl p-2 bg-slate-50">
                {filterOptions.indicators.map(ind => (
                  <CheckboxItem 
                    key={ind.id} 
                    label={ind.display_name} 
                    checked={selectedIndicators.includes(ind.id)}
                    onClick={() => {
                      setSelectedIndicators(prev => prev.includes(ind.id) ? prev.filter(id => id !== ind.id) : [...prev, ind.id])
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Filtro Data Lançamento */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data de Lançamento</label>
              <div className="flex gap-2">
                <input 
                  type="date" 
                  value={dateRange.start} 
                  onChange={e => setDateRange({...dateRange, start: e.target.value})}
                  className="flex-1 bg-slate-50 border-slate-200 text-slate-600 text-xs font-bold rounded-xl p-2.5 outline-none"
                />
                <input 
                  type="date" 
                  value={dateRange.end} 
                  onChange={e => setDateRange({...dateRange, end: e.target.value})}
                  className="flex-1 bg-slate-50 border-slate-200 text-slate-600 text-xs font-bold rounded-xl p-2.5 outline-none"
                />
              </div>
            </div>

            {hasActiveFilters && (
               <button onClick={clearFilters} className="w-full py-3 bg-rose-50 text-rose-600 font-bold rounded-xl text-xs">
                 Limpar Todos os Filtros
               </button>
            )}
          </div>
        )}

        {/* CONTAINER DE DADOS */}
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-30 flex items-center justify-center rounded-[2.5rem]">
              <Loader2 className="animate-spin text-sky-600" size={40} />
            </div>
          )}

          {/* --- VERSÃO DESKTOP (TABELA) --- */}
          <div className="hidden md:block bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/60 border border-slate-200 overflow-visible">
            <div className="overflow-visible"> 
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    
                    {/* COLUNA: SEMANA */}
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest relative w-[18%]">
                      <button 
                        onClick={() => toggleDropdown('week')}
                        className={`flex items-center gap-2 hover:text-sky-600 transition-colors ${selectedWeekDate ? 'text-sky-600' : ''}`}
                      >
                        <div className="flex items-center gap-2"><Calendar size={14} /> Semana</div>
                        <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'week' ? 'rotate-180' : ''}`} />
                      </button>
                      {/* Dropdown Semana */}
                      {activeDropdown === 'week' && (
                          <div className="absolute top-full left-4 mt-2 w-64 bg-white shadow-2xl rounded-2xl border border-slate-100 z-50 p-2 max-h-80 overflow-y-auto animate-in slide-in-from-top-2">
                             <div className="p-3 border-b border-slate-50 mb-1">
                                <span className="text-xs font-bold text-slate-800">Filtrar por Semana</span>
                             </div>
                            <div onClick={() => {setSelectedWeekDate(''); setActiveDropdown(null)}} className="p-2.5 text-xs font-medium hover:bg-slate-50 cursor-pointer rounded-lg text-slate-500 mb-1">
                               Todas as Semanas
                            </div>
                            {filterOptions.weeks.map(w => (
                              <div key={w.date} onClick={() => {setSelectedWeekDate(w.date); setActiveDropdown(null)}} className={`p-2.5 text-xs cursor-pointer rounded-lg flex justify-between items-center mb-1 transition-colors ${selectedWeekDate === w.date ? 'bg-sky-50 text-sky-700 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}>
                                {w.label} {selectedWeekDate === w.date && <Check size={12} />}
                              </div>
                            ))}
                          </div>
                      )}
                    </th>

                    {/* COLUNA: UNIDADE (MULTI-SELECT) */}
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest relative w-[25%]">
                        <button 
                           onClick={() => toggleDropdown('wards')}
                           className={`flex items-center gap-2 hover:text-sky-600 transition-colors ${selectedWards.length > 0 ? 'text-sky-600' : ''}`}
                        >
                           <div className="flex items-center gap-2"><Building2 size={14} /> Unidade {selectedWards.length > 0 && `(${selectedWards.length})`}</div>
                           <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'wards' ? 'rotate-180' : ''}`} />
                        </button>
                        {/* Dropdown Unidade */}
                        {activeDropdown === 'wards' && (
                           <div className="absolute top-full left-0 mt-2 w-72 bg-white shadow-2xl rounded-2xl border border-slate-100 z-50 p-3 max-h-80 overflow-hidden flex flex-col animate-in slide-in-from-top-2">
                              <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-50">
                                 <span className="text-xs font-bold text-slate-800">Selecionar Unidades</span>
                                 {selectedWards.length > 0 && <button onClick={() => setSelectedWards([])} className="text-[10px] font-bold text-rose-500 hover:text-rose-600">Limpar</button>}
                              </div>
                              <div className="overflow-y-auto flex-1 pr-1">
                                 {filterOptions.wards.map(ward => (
                                    <CheckboxItem 
                                       key={ward.id} 
                                       label={ward.name} 
                                       checked={selectedWards.includes(ward.id)} 
                                       onClick={() => {
                                          setSelectedWards(prev => prev.includes(ward.id) ? prev.filter(id => id !== ward.id) : [...prev, ward.id])
                                       }}
                                    />
                                 ))}
                              </div>
                           </div>
                        )}
                    </th>

                    {/* COLUNA: INDICADOR (MULTI-SELECT) */}
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest relative w-[25%]">
                        <button 
                           onClick={() => toggleDropdown('indicators')}
                           className={`flex items-center gap-2 hover:text-sky-600 transition-colors ${selectedIndicators.length > 0 ? 'text-sky-600' : ''}`}
                        >
                           <div className="flex items-center gap-2"><Target size={14} /> Indicador {selectedIndicators.length > 0 && `(${selectedIndicators.length})`}</div>
                           <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'indicators' ? 'rotate-180' : ''}`} />
                        </button>
                         {/* Dropdown Indicador */}
                         {activeDropdown === 'indicators' && (
                           <div className="absolute top-full left-0 mt-2 w-80 bg-white shadow-2xl rounded-2xl border border-slate-100 z-50 p-3 max-h-80 overflow-hidden flex flex-col animate-in slide-in-from-top-2">
                              <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-50">
                                 <span className="text-xs font-bold text-slate-800">Selecionar Indicadores</span>
                                 {selectedIndicators.length > 0 && <button onClick={() => setSelectedIndicators([])} className="text-[10px] font-bold text-rose-500 hover:text-rose-600">Limpar</button>}
                              </div>
                              <div className="overflow-y-auto flex-1 pr-1">
                                 {filterOptions.indicators.map(ind => (
                                    <CheckboxItem 
                                       key={ind.id} 
                                       label={ind.display_name} 
                                       checked={selectedIndicators.includes(ind.id)} 
                                       onClick={() => {
                                          setSelectedIndicators(prev => prev.includes(ind.id) ? prev.filter(id => id !== ind.id) : [...prev, ind.id])
                                       }}
                                    />
                                 ))}
                              </div>
                           </div>
                        )}
                    </th>

                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center w-[10%]">
                       <div className="flex items-center justify-center gap-2"><Hash size={14} /> Valor</div>
                    </th>

                    {/* COLUNA: LANÇAMENTO (DATE RANGE) */}
                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right relative w-[20%]">
                        <button 
                           onClick={() => toggleDropdown('launch')}
                           className={`flex items-center justify-end w-full gap-2 hover:text-sky-600 transition-colors ${(dateRange.start || dateRange.end) ? 'text-sky-600' : ''}`}
                        >
                           <div className="flex items-center gap-2"><Clock size={14} /> Lançamento</div>
                           <ChevronDown size={12} className={`transition-transform ${activeDropdown === 'launch' ? 'rotate-180' : ''}`} />
                        </button>
                        {/* Dropdown Data */}
                        {activeDropdown === 'launch' && (
                           <div className="absolute top-full right-4 mt-2 w-72 bg-white shadow-2xl rounded-2xl border border-slate-100 z-50 p-4 animate-in slide-in-from-top-2 cursor-default">
                              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-50">
                                 <span className="text-xs font-bold text-slate-800">Intervalo de Data</span>
                                 {(dateRange.start || dateRange.end) && <button onClick={() => setDateRange({start:'', end:''})} className="text-[10px] font-bold text-rose-500 hover:text-rose-600">Limpar</button>}
                              </div>
                              <div className="space-y-3">
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">De:</label>
                                    <input 
                                       type="date" 
                                       value={dateRange.start}
                                       onChange={e => setDateRange({...dateRange, start: e.target.value})}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 outline-none focus:border-sky-400"
                                    />
                                 </div>
                                 <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Até:</label>
                                    <input 
                                       type="date" 
                                       value={dateRange.end}
                                       onChange={e => setDateRange({...dateRange, end: e.target.value})}
                                       className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 outline-none focus:border-sky-400"
                                    />
                                 </div>
                              </div>
                           </div>
                        )}
                    </th>

                    <th className="p-6 w-[2%]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.length === 0 && !loading && (
                     <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 text-sm font-medium">Nenhum registro encontrado com os filtros selecionados.</td>
                     </tr>
                  )}
                  {data.map((row) => {
                    const { week, year } = getWeekNumber(new Date(row.week_start + 'T12:00:00'))
                    return (
                      <tr key={row.id} className="group hover:bg-slate-50/80 transition-all">
                        <td className="p-6">
                          <span className="text-sm font-bold text-slate-700">Semana {week}</span>
                          <span className="text-[10px] text-slate-400 block font-medium">{year}</span>
                        </td>
                        <td className="p-6">
                          <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase border border-slate-200">
                            {row.wards.name}
                          </span>
                        </td>
                        <td className="p-6">
                          <span className="text-sm font-semibold text-slate-600 group-hover:text-sky-700 transition-colors">
                            {row.indicators.display_name}
                          </span>
                        </td>
                        <td className="p-6 text-center">
                          <span className="text-base font-black text-slate-800 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                            {row.value}
                          </span>
                        </td>
                        <td className="p-6 text-right">
                          <span className="text-[11px] font-bold text-slate-500">
                            {new Date(row.created_at).toLocaleDateString('pt-BR')}
                          </span>
                          <span className="text-[10px] text-slate-300 block">
                            {new Date(row.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                          </span>
                        </td>
                        <td className="p-6 text-right">
                          <button 
                            onClick={() => {
                              setEditingRow(row);
                              setEditForm({ value: row.value, week_start: row.week_start });
                              setShowDeleteConfirm(false);
                              setIsEditModalOpen(true);
                              setActiveDropdown(null); // Fecha qualquer filtro aberto
                            }}
                            className="p-2 text-slate-300 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- VERSÃO MOBILE (CARDS) --- */}
          <div className="md:hidden space-y-3">
             {data.length === 0 && !loading && (
               <div className="text-center py-10 text-slate-400 text-sm font-medium bg-white rounded-3xl border border-slate-100">
                  Nenhum registro encontrado.
               </div>
            )}
            {data.map((row) => {
              const { week, year } = getWeekNumber(new Date(row.week_start + 'T12:00:00'))
              return (
                <div key={row.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col gap-3 relative">
                  
                  {/* Card Header: Indicador e Valor */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col">
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Indicador</span>
                       <span className="text-sm font-bold text-slate-800 leading-tight">
                         {row.indicators.display_name}
                       </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl flex flex-col items-center min-w-[3.5rem]">
                       <span className="text-[10px] text-slate-400 font-bold uppercase">Valor</span>
                       <span className="text-lg font-black text-slate-800">{row.value}</span>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 w-full my-1"></div>

                  {/* Card Body: Detalhes */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unidade</span>
                      <span className="inline-block px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                        {row.wards.name}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Semana Ref.</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-slate-700">Semana {week}</span>
                        <span className="text-[10px] text-slate-400">/{year}</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer: Data e Ação */}
                  <div className="flex justify-between items-end mt-2 pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Clock size={12} />
                        <span className="text-[10px] font-medium">
                          {new Date(row.created_at).toLocaleDateString('pt-BR')} às {new Date(row.created_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          setEditingRow(row);
                          setEditForm({ value: row.value, week_start: row.week_start });
                          setShowDeleteConfirm(false);
                          setIsEditModalOpen(true);
                        }}
                        className="p-2 text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-xl transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* PAGINAÇÃO */}
          <div className="mt-4 md:mt-0 p-4 md:p-6 bg-white md:bg-slate-50/50 md:border-t border-slate-100 rounded-3xl md:rounded-t-none md:rounded-b-[2.5rem] flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm md:shadow-none border border-slate-200 md:border-0">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest order-2 sm:order-1">
              Página {page} de {Math.max(1, Math.ceil(totalCount / pageSize))}
            </p>
            <div className="flex items-center gap-2 order-1 sm:order-2 w-full sm:w-auto justify-center">
              <button 
                disabled={page === 1} 
                onClick={() => setPage(p => p - 1)}
                className="flex-1 sm:flex-none p-3 md:p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-sky-600 disabled:opacity-30 transition-all shadow-sm flex justify-center"
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                disabled={page >= Math.ceil(totalCount / pageSize)} 
                onClick={() => setPage(p => p + 1)}
                className="flex-1 sm:flex-none p-3 md:p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-sky-600 disabled:opacity-30 transition-all shadow-sm flex justify-center"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE EDIÇÃO AVANÇADO */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsEditModalOpen(false)} />
          <div className="relative bg-white w-full max-w-md mx-auto rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 md:p-8 overflow-y-auto">
              {!showDeleteConfirm ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800">Editar Registro</h3>
                      <p className="text-slate-400 text-sm font-medium pr-4">{editingRow?.indicators.display_name}</p>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-slate-300 hover:text-slate-500 p-2 -mr-2 -mt-2"><X /></button>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Referência</label>
                        <input 
                          type="date" 
                          value={editForm.week_start}
                          onChange={e => setEditForm({...editForm, week_start: e.target.value})}
                          className="w-full bg-slate-50 border-slate-200 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Medido</label>
                        <input 
                          type="number" 
                          value={editForm.value}
                          onChange={e => setEditForm({...editForm, value: Number(e.target.value)})}
                          className="w-full bg-slate-50 border-slate-200 rounded-2xl p-3 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 pt-4">
                    <button 
                      onClick={handleUpdate}
                      disabled={actionLoading}
                      className="w-full bg-sky-600 hover:bg-sky-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-sky-200 transition-all flex items-center justify-center gap-2"
                    >
                      {actionLoading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      ATUALIZAR DADOS
                    </button>
                    <button 
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full py-3 text-rose-500 text-xs font-black uppercase tracking-widest hover:bg-rose-50 rounded-2xl transition-all"
                    >
                      Excluir Registro
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-6 py-4">
                  <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto">
                    <AlertTriangle size={40} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800">Confirmar Exclusão?</h3>
                    <p className="text-slate-500 text-sm mt-2">Esta ação é permanente e removerá este lançamento de todos os relatórios e indicadores.</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all">VOLTAR</button>
                    <button 
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="flex-1 py-4 bg-rose-500 text-white font-bold rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-200"
                    >
                      {actionLoading ? "EXCLUINDO..." : "SIM, EXCLUIR"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}