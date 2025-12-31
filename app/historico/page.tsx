'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import { 
  History, Calendar, Hash, Building2, Target, 
  ChevronLeft, ChevronRight, Filter, Clock, Loader2,
  X, Check, ChevronDown, Edit2, Trash2, Save, AlertTriangle
} from 'lucide-react'

// --- CONFIGURAÇÃO VISUAL ---
const THEME = {
  primary: '#0069a8',
  primaryHover: '#00588d',
  textTitle: '#157493',
  bg: '#f8fafc',
  danger: '#e11d48', // Cor para excluir
}

// --- HELPERS ---
// Função para calcular o número da semana ISO
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

type FilterOptions = {
  wards: { id: string, name: string }[]
  indicators: { id: string, display_name: string }[]
  weeks: { date: string, label: string }[]
}

export default function HistoricoPage() {
  const supabase = createClient()
  
  // --- STATES DE DADOS ---
  const [data, setData] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  
  // --- STATES PARA OPÇÕES DOS FILTROS ---
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ wards: [], indicators: [], weeks: [] })

  // --- STATES DOS FILTROS ATIVOS ---
  const [selectedWards, setSelectedWards] = useState<string[]>([])
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([])
  const [selectedWeekDate, setSelectedWeekDate] = useState<string>('') 
  const [selectedLaunchDate, setSelectedLaunchDate] = useState<string>('') 

  // Controle de qual dropdown está aberto
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null)

  // Paginação
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const totalPages = Math.ceil(totalCount / pageSize)

  // --- STATES DE EDIÇÃO E MODAL ---
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Form state para edição
  const [editForm, setEditForm] = useState({
    ward_id: '',
    indicator_id: '',
    week_start: '',
    value: 0
  })

  // --- CARGA INICIAL (OPÇÕES DE FILTRO) ---
  useEffect(() => {
    async function loadOptions() {
      const [wardsRes, indRes, weeksRes] = await Promise.all([
        supabase.from('wards').select('id, name').order('name'),
        supabase.from('indicators').select('id, display_name').order('display_name'),
        supabase.from('weekly_indicator_data').select('week_start').order('week_start', { ascending: false })
      ])

      // Processamento das semanas únicas
      let uniqueWeeks: { date: string, label: string }[] = []
      if (weeksRes.data) {
        const seen = new Set()
        weeksRes.data.forEach((item: any) => {
          if (!seen.has(item.week_start)) {
            seen.add(item.week_start)
            const d = new Date(item.week_start + 'T12:00:00') 
            const { week, year } = getWeekNumber(d)
            uniqueWeeks.push({ date: item.week_start, label: `Semana ${week} - ${year}` })
          }
        })
      }

      setFilterOptions({
        wards: wardsRes.data || [],
        indicators: indRes.data || [],
        weeks: uniqueWeeks
      })
    }
    loadOptions()
  }, [supabase])

  // --- BUSCA PRINCIPAL ---
  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('weekly_indicator_data')
        .select(`
          id, value, week_start, created_at,
          wards!inner ( id, name ),
          indicators!inner ( id, display_name )
        `, { count: 'exact' })
      
      // APLICAÇÃO DOS FILTROS
      if (selectedWards.length > 0) {
        query = query.in('ward_id', selectedWards)
      }
      
      if (selectedIndicators.length > 0) {
        query = query.in('indicator_id', selectedIndicators)
      }

      if (selectedWeekDate) {
        query = query.eq('week_start', selectedWeekDate)
      }

      if (selectedLaunchDate) {
        const startOfDay = `${selectedLaunchDate}T00:00:00`
        const endOfDay = `${selectedLaunchDate}T23:59:59`
        query = query.gte('created_at', startOfDay).lte('created_at', endOfDay)
      }

      // Ordenação e Paginação
      const { data: result, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      if (result) setData(result as any)
      if (count !== null) setTotalCount(count)

    } catch (error) {
      console.error('Erro ao buscar histórico:', error)
    } finally {
      setLoading(false)
    }
  }, [supabase, page, pageSize, selectedWards, selectedIndicators, selectedWeekDate, selectedLaunchDate])

  // Recarrega quando filtros mudam
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Resetar página ao filtrar
  useEffect(() => { setPage(1) }, [selectedWards, selectedIndicators, selectedWeekDate, selectedLaunchDate])


  // --- HANDLERS DE FILTRO ---
  const toggleWard = (id: string) => {
    setSelectedWards(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const toggleIndicator = (id: string) => {
    setSelectedIndicators(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const clearAllFilters = () => {
    setSelectedWards([])
    setSelectedIndicators([])
    setSelectedWeekDate('')
    setSelectedLaunchDate('')
    setPage(1)
  }

  const hasActiveFilters = selectedWards.length > 0 || selectedIndicators.length > 0 || selectedWeekDate !== '' || selectedLaunchDate !== ''

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.filter-container')) {
        setActiveDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // --- HANDLERS DE EDIÇÃO E EXCLUSÃO ---

  const openEditModal = (row: HistoryEntry) => {
    setEditingId(row.id)
    setEditForm({
      ward_id: row.wards.id,
      indicator_id: row.indicators.id,
      week_start: row.week_start,
      value: row.value
    })
    setShowDeleteConfirm(false)
    setIsEditModalOpen(true)
  }

  const closeEditModal = () => {
    setIsEditModalOpen(false)
    setEditingId(null)
    setShowDeleteConfirm(false)
  }

  const handleUpdate = async () => {
    if (!editingId) return
    try {
      setActionLoading(true)
      const { error } = await supabase
        .from('weekly_indicator_data')
        .update({
          ward_id: editForm.ward_id,
          indicator_id: editForm.indicator_id,
          week_start: editForm.week_start,
          value: editForm.value
        })
        .eq('id', editingId)

      if (error) throw error
      
      await fetchHistory() // Recarrega a lista
      closeEditModal()
    } catch (error) {
      console.error('Erro ao atualizar:', error)
      alert('Erro ao atualizar lançamento.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    try {
      setActionLoading(true)
      const { error } = await supabase
        .from('weekly_indicator_data')
        .delete()
        .eq('id', editingId)

      if (error) throw error

      await fetchHistory() // Recarrega a lista
      closeEditModal()
    } catch (error) {
      console.error('Erro ao excluir:', error)
      alert('Erro ao excluir lançamento.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-4 md:p-12 font-sans" style={{ backgroundColor: THEME.bg }}>
      <div className="mx-auto max-w-7xl space-y-8">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight mb-1" style={{ color: THEME.textTitle }}>Histórico</h1>
            <p className="text-slate-500 font-semibold uppercase text-xs tracking-widest">
              {totalCount} Lançamentos Encontrados
            </p>
          </div>

          <div className="flex items-center gap-3">
             {hasActiveFilters && (
               <button 
                 onClick={clearAllFilters}
                 className="flex items-center gap-2 text-xs font-bold text-rose-500 hover:text-rose-700 bg-rose-50 px-3 py-2 rounded-xl transition-colors"
               >
                 <X size={14} /> Limpar Filtros
               </button>
             )}
            
            {/* Controle de Itens por Página */}
            <div className="flex items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pl-2">Exibir:</span>
              <select 
                value={pageSize} 
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="bg-slate-50 border-transparent text-slate-700 font-bold text-xs rounded-lg py-1.5 pl-2 pr-6 focus:ring-0 cursor-pointer outline-none"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </header>

        {/* TABELA CARD */}
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-visible relative min-h-[500px]">
          
          {loading && (
            <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-[2rem]">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: THEME.primary }} />
            </div>
          )}

          <div className="overflow-x-auto rounded-t-[2rem]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100">
                  
                  {/* COLUNA: SEMANA REF */}
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest min-w-[200px] relative filter-container">
                    <div className="flex items-center gap-2 cursor-pointer hover:text-[#0069a8] transition-colors"
                         onClick={() => setActiveDropdown(activeDropdown === 'week' ? null : 'week')}>
                      <Calendar size={14} className={selectedWeekDate ? 'text-[#0069a8]' : ''} /> 
                      <span className={selectedWeekDate ? 'text-[#0069a8]' : ''}>Semana Ref.</span>
                      <ChevronDown size={12} />
                    </div>
                    
                    {activeDropdown === 'week' && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 p-2 max-h-64 overflow-y-auto">
                        <div 
                          className={`p-2 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-50 mb-1 ${!selectedWeekDate ? 'bg-sky-50 text-[#0069a8]' : 'text-slate-600'}`}
                          onClick={() => { setSelectedWeekDate(''); setActiveDropdown(null); }}
                        >
                          Todas as Semanas
                        </div>
                        {filterOptions.weeks.map((week, idx) => (
                          <div 
                            key={idx}
                            onClick={() => { setSelectedWeekDate(week.date); setActiveDropdown(null); }}
                            className={`p-2 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50 flex items-center justify-between ${selectedWeekDate === week.date ? 'bg-sky-50 text-[#0069a8] font-bold' : 'text-slate-600'}`}
                          >
                            {week.label}
                            {selectedWeekDate === week.date && <Check size={14}/>}
                          </div>
                        ))}
                      </div>
                    )}
                  </th>

                  {/* COLUNA: ALA */}
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest min-w-[220px] relative filter-container">
                    <div className="flex items-center gap-2 cursor-pointer hover:text-[#0069a8] transition-colors"
                         onClick={() => setActiveDropdown(activeDropdown === 'ward' ? null : 'ward')}>
                      <Building2 size={14} className={selectedWards.length > 0 ? 'text-[#0069a8]' : ''} /> 
                      <span className={selectedWards.length > 0 ? 'text-[#0069a8]' : ''}>Ala / Unidade</span>
                      {selectedWards.length > 0 && <span className="bg-[#0069a8] text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full">{selectedWards.length}</span>}
                      <ChevronDown size={12} />
                    </div>

                    {activeDropdown === 'ward' && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 p-2 max-h-80 overflow-y-auto">
                        <div className="p-2 text-xs font-bold text-slate-400 border-b border-slate-50 mb-2">Selecione uma ou mais:</div>
                        {filterOptions.wards.map(ward => (
                          <div 
                            key={ward.id}
                            onClick={() => toggleWard(ward.id)}
                            className={`p-2.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50 flex items-center gap-3 mb-1 ${selectedWards.includes(ward.id) ? 'bg-sky-50 text-[#0069a8]' : 'text-slate-600'}`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedWards.includes(ward.id) ? 'bg-[#0069a8] border-[#0069a8]' : 'border-slate-300 bg-white'}`}>
                              {selectedWards.includes(ward.id) && <Check size={10} className="text-white" />}
                            </div>
                            {ward.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </th>

                  {/* COLUNA: INDICADOR */}
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest min-w-[280px] relative filter-container">
                    <div className="flex items-center gap-2 cursor-pointer hover:text-[#0069a8] transition-colors"
                         onClick={() => setActiveDropdown(activeDropdown === 'indicator' ? null : 'indicator')}>
                      <Target size={14} className={selectedIndicators.length > 0 ? 'text-[#0069a8]' : ''} /> 
                      <span className={selectedIndicators.length > 0 ? 'text-[#0069a8]' : ''}>Indicador</span>
                      {selectedIndicators.length > 0 && <span className="bg-[#0069a8] text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full">{selectedIndicators.length}</span>}
                      <ChevronDown size={12} />
                    </div>

                    {activeDropdown === 'indicator' && (
                      <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 p-2 max-h-80 overflow-y-auto">
                        <div className="p-2 text-xs font-bold text-slate-400 border-b border-slate-50 mb-2">Selecione os indicadores:</div>
                        {filterOptions.indicators.map(ind => (
                          <div 
                            key={ind.id}
                            onClick={() => toggleIndicator(ind.id)}
                            className={`p-2.5 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50 flex items-center gap-3 mb-1 ${selectedIndicators.includes(ind.id) ? 'bg-sky-50 text-[#0069a8]' : 'text-slate-600'}`}
                          >
                             <div className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${selectedIndicators.includes(ind.id) ? 'bg-[#0069a8] border-[#0069a8]' : 'border-slate-300 bg-white'}`}>
                              {selectedIndicators.includes(ind.id) && <Check size={10} className="text-white" />}
                            </div>
                            <span className="leading-tight">{ind.display_name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </th>

                  {/* COLUNA: VALOR */}
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                    <div className="flex items-center justify-center gap-2"><Hash size={14}/> Valor</div>
                  </th>

                  {/* COLUNA: DATA LANÇAMENTO */}
                  <th className="p-6 text-[11px] font-black text-slate-400 uppercase tracking-widest text-right relative filter-container">
                    <div className="flex items-center justify-end gap-2 cursor-pointer hover:text-[#0069a8] transition-colors"
                         onClick={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}>
                      <Clock size={14} className={selectedLaunchDate ? 'text-[#0069a8]' : ''} /> 
                      <span className={selectedLaunchDate ? 'text-[#0069a8]' : ''}>Data Lançamento</span>
                      <ChevronDown size={12} />
                    </div>

                    {activeDropdown === 'date' && (
                      <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 p-4">
                        <label className="text-xs font-bold text-slate-500 mb-2 block">Filtrar por dia específico:</label>
                        <input 
                          type="date" 
                          value={selectedLaunchDate}
                          onChange={(e) => { setSelectedLaunchDate(e.target.value); setActiveDropdown(null); }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-bold text-slate-700 outline-none focus:border-[#0069a8]"
                        />
                        {selectedLaunchDate && (
                          <button 
                            onClick={() => setSelectedLaunchDate('')}
                            className="mt-2 text-xs text-rose-500 font-bold hover:underline w-full text-center"
                          >
                            Limpar Data
                          </button>
                        )}
                      </div>
                    )}
                  </th>
                  
                  {/* COLUNA: AÇÕES (NOVA) */}
                  <th className="p-6 w-12 text-[11px] font-black text-slate-400 uppercase tracking-widest text-center">
                  </th>

                </tr>
              </thead>
              
              <tbody className="divide-y divide-slate-50">
                {data.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-300">
                        <History size={48} />
                        <p className="font-bold text-slate-400">Nenhum registro encontrado para estes filtros.</p>
                        <button onClick={clearAllFilters} className="text-[#0069a8] text-sm font-bold hover:underline mt-2">Limpar todos os filtros</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.map((row) => {
                    const rowDate = new Date(row.week_start + 'T12:00:00');
                    const { week, year } = getWeekNumber(rowDate);

                    return (
                      <tr key={row.id} className="hover:bg-sky-50/30 transition-colors group">
                        <td className="p-6 text-sm font-bold text-slate-600">
                          Semana {week} <span className="text-slate-300 font-normal ml-1">/ {year}</span>
                        </td>
                        <td className="p-6">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {row.wards?.name}
                          </span>
                        </td>
                        <td className="p-6 text-sm font-bold text-slate-700 group-hover:text-[#0069a8] transition-colors">
                          {row.indicators?.display_name}
                        </td>
                        <td className="p-6 text-center">
                          <span className="text-lg font-black text-slate-800">
                            {row.value}
                          </span>
                        </td>
                        <td className="p-6 text-right text-xs font-bold text-slate-400">
                          {new Date(row.created_at).toLocaleDateString('pt-BR')} <span className="font-normal opacity-70">{new Date(row.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                        </td>
                        {/* BOTÃO EDITAR */}
                        <td className="p-6 text-center">
                          <button 
                            onClick={() => openEditModal(row)}
                            className="p-2 rounded-lg text-slate-300 hover:text-[#0069a8] hover:bg-sky-50 transition-all opacity-0 group-hover:opacity-100"
                            title="Editar Lançamento"
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER DE PAGINAÇÃO */}
          <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-b-[2rem]">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Mostrando {data.length > 0 ? (page - 1) * pageSize + 1 : 0} até {Math.min(page * pageSize, totalCount)} de {totalCount}
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-[#0069a8] hover:text-[#0069a8] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-sm">
                <span className="w-8 text-center text-sm font-black text-slate-700">{page}</span>
                <span className="text-slate-300">/</span>
                <span className="w-8 text-center text-sm font-bold text-slate-400">{totalPages || 1}</span>
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-[#0069a8] hover:text-[#0069a8] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- MODAL DE EDIÇÃO --- */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={closeEditModal} />
          
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-[#0069a8] p-6 text-white flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Edit2 size={20} /> Editar Lançamento
                </h2>
                <p className="text-sky-100 text-xs mt-1">Atualize as informações ou exclua o registro.</p>
              </div>
              <button onClick={closeEditModal} className="text-white/70 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-6 overflow-y-auto">
              
              {!showDeleteConfirm ? (
                /* FORMULÁRIO DE EDIÇÃO */
                <>
                  <div className="space-y-4">
                    {/* Campo Ala */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ala / Ramo</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#0069a8]/20 focus:border-[#0069a8] transition-all"
                        value={editForm.ward_id}
                        onChange={e => setEditForm({...editForm, ward_id: e.target.value})}
                      >
                        <option value="">Selecione...</option>
                        {filterOptions.wards.map(ward => (
                          <option key={ward.id} value={ward.id}>{ward.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Campo Indicador */}
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Indicador</label>
                      <select 
                        className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#0069a8]/20 focus:border-[#0069a8] transition-all"
                        value={editForm.indicator_id}
                        onChange={e => setEditForm({...editForm, indicator_id: e.target.value})}
                      >
                        <option value="">Selecione...</option>
                        {filterOptions.indicators.map(ind => (
                          <option key={ind.id} value={ind.id}>{ind.display_name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Campo Data */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dia da Semana</label>
                        <input 
                          type="date"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#0069a8]/20 focus:border-[#0069a8] transition-all"
                          value={editForm.week_start}
                          onChange={e => setEditForm({...editForm, week_start: e.target.value})}
                        />
                      </div>

                      {/* Campo Valor */}
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Valor Realizado</label>
                        <input 
                          type="number"
                          className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#0069a8]/20 focus:border-[#0069a8] transition-all"
                          value={editForm.value}
                          onChange={e => setEditForm({...editForm, value: Number(e.target.value)})}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* CONFIRMAÇÃO DE EXCLUSÃO */
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500 mb-2">
                    <AlertTriangle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">Tem certeza que deseja excluir?</h3>
                  <p className="text-sm text-slate-500">
                    Esta ação não poderá ser desfeita. O registro será removido permanentemente do histórico.
                  </p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 p-6 border-t border-slate-100 flex items-center justify-between">
              
              {!showDeleteConfirm ? (
                <>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-2 text-rose-500 font-bold text-sm px-4 py-3 rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 size={16} /> Excluir
                  </button>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={closeEditModal}
                      className="text-slate-500 font-bold text-sm px-4 py-3 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleUpdate}
                      disabled={actionLoading}
                      className="flex items-center gap-2 bg-[#0069a8] text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-[#00588d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sky-900/20"
                    >
                      {actionLoading ? <Loader2 size={16} className="animate-spin"/> : <Save size={16} />}
                      Salvar Alterações
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-end w-full gap-3">
                  <button 
                    onClick={() => setShowDeleteConfirm(false)}
                    className="text-slate-500 font-bold text-sm px-4 py-3 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleDelete}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-rose-500 text-white font-bold text-sm px-6 py-3 rounded-xl hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-900/20"
                  >
                    {actionLoading ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16} />}
                    Sim, Excluir Registro
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </main>
  )
}