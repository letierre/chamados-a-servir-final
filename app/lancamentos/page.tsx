'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase/client'
import {
  Building2, Target, Calendar, Hash, Save, Loader2,
  AlertCircle, CheckCircle2, History, Clock, ExternalLink,
  Users, X, BookOpen
} from 'lucide-react'

// ═══════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════

const THEME = {
  primary: '#0069a8',
  primaryHover: '#00588d',
  textTitle: '#157493',
  bg: '#f8fafc',
}

// ═══════════════════════════════════════
// MAPEAMENTO DE LINKS DA IGREJA
// ═══════════════════════════════════════

// Mapa: ward.name → unitNumber (para montar URLs dinamicamente)
const WARD_UNITS: Record<string, string> = {
  'Ala Cachoeira do Sul': '60208',
  'Ala Lajeado': '82252',
  'Ala Marina': '346136',
  'Ala Rio Pardo': '281441',
  'Ala Santa Cruz do Sul': '323306',
  'Ala Santa Cruz do Sul Campus': '331465',
  'Ala Venâncio Aires': '331686',
  'Ramo Estrela': '1547771',
}

// Mapa: ward.name → orgId (para jejum/doações)
const WARD_ORG_IDS: Record<string, string> = {
  'Ala Cachoeira do Sul': '1467',
  'Ala Lajeado': '29016',
  'Ala Marina': '20246',
  'Ala Rio Pardo': '14601',
  'Ala Santa Cruz do Sul': '7167',
  'Ala Santa Cruz do Sul Campus': '1218',
  'Ala Venâncio Aires': '33991',
  'Ramo Estrela': '4010323',
}

// Mapa: slug do indicador → function que gera a URL dado o wardName
type LinkBuilder = (wardName: string) => string | null

// Substitua o bloco INDICATOR_LINKS inteiro por este:

const INDICATOR_LINKS: Record<string, LinkBuilder> = {
  frequencia_sacramental: (w) => {
    const unit = WARD_UNITS[w]
    return unit ? `https://lcr.churchofjesuschrist.org/report/sacrament-attendance?lang=por&unitNumber=${unit}` : null
  },
  membros_jejuando: (w) => {
    const org = WARD_ORG_IDS[w]
    return org ? `https://lcrffe.churchofjesuschrist.org/donations?orgId=${org}` : null
  },
  membros_participantes: (w) => {
    const unit = WARD_UNITS[w]
    return unit ? `https://bl.churchofjesuschrist.org/bp/pt/#/indicate-activity/297490/${unit}` : null
  },
  // ✅ CORRIGIDO: era "membros_retornando"
  membros_retornando_a_igreja: (w) => {
    const unit = WARD_UNITS[w]
    return unit ? `https://lcr.churchofjesuschrist.org/one-work/progress-record?lang=por&unitNumber=${unit}&tab=returningMembers` : null
  },
  recomendacao_templo_com_investidura: (w) => {
    const unit = WARD_UNITS[w]
    return unit ? `https://lcr.churchofjesuschrist.org/temple/recommend/recommend-status?lang=por&type=REGULAR&status=active&unitNumber=${unit}` : null
  },
  recomendacao_templo_sem_investidura: (w) => {
    const unit = WARD_UNITS[w]
    return unit ? `https://lcr.churchofjesuschrist.org/temple/recommend/recommend-status?lang=por&type=REGULAR&status=active&unitNumber=${unit}` : null
  },
  batismo_converso: (w) => {
    const unit = WARD_UNITS[w]
    return unit ? `https://lcr.churchofjesuschrist.org/one-work/progress-record?lang=por&unitNumber=${unit}&tab=recentConverts` : null
  },
  // ✅ CORRIGIDO: era "missionarios_servindo"
  missionario_servindo_missao_do_brasil: (_w) => {
    return 'https://missionaryrecommendations.churchofjesuschrist.org/recommendations/home/candidates?vctype=ft'
  },
}

// Slugs que compartilham o mesmo link (Recomendações)
const RECOMENDACAO_SLUGS = ['recomendacao_templo_com_investidura', 'recomendacao_templo_sem_investidura']

// ═══════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════

type Ward = { id: string; name: string; membership_count: number }
type Indicator = { id: string; display_name: string; slug: string; indicator_type: string }
type RecentEntry = {
  id: string; value: number; week_start: string
  wards: { name: string }; indicators: { display_name: string }
}
type Toast = { type: 'success' | 'error'; text: string } | null

// ═══════════════════════════════════════
// VALIDAÇÃO
// ═══════════════════════════════════════

function validateForm(value: number, weekStart: string): string | null {
  if (!weekStart) return 'Selecione uma data.'
  if (isNaN(value) || value < 0) return 'Valor deve ser positivo.'
  if (value > 10000) return 'Valor parece muito alto. Verifique.'
  const today = new Date().toISOString().split('T')[0]
  if (weekStart > today) return 'Não é possível usar datas futuras.'
  const limit = new Date()
  limit.setDate(limit.getDate() - 90)
  if (weekStart < limit.toISOString().split('T')[0]) return 'Data muito antiga (máximo 90 dias).'
  const d = new Date(weekStart + 'T12:00:00')
  if (d.getDay() !== 0) return 'A data deve ser um domingo.'
  return null
}

// ═══════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════

function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  if (!toast) return null
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [toast, onClose])
  return (
    <div className="fixed top-6 right-6 z-[200] animate-in slide-in-from-top-3 fade-in duration-300">
      <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl border ${
        toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
      }`}>
        {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
        <span className="font-bold text-sm">{toast.text}</span>
        <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════

export default function LancamentosPage() {
  const supabase = createClient()
  const router = useRouter()

  // Dados base
  const [wards, setWards] = useState<Ward[]>([])
  const [indicators, setIndicators] = useState<Indicator[]>([])
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])

  // Formulário principal
  const [wardId, setWardId] = useState('')
  const [indicatorId, setIndicatorId] = useState('')
  const [value, setValue] = useState('')
  const [weekStart, setWeekStart] = useState('')

  // Campo extra: Recomendações (segundo valor)
  const [valueRecomSem, setValueRecomSem] = useState('')

  // Campo extra: Membros Participantes (membership_count)
  const [membershipCount, setMembershipCount] = useState('')

  // UI
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [linkOpened, setLinkOpened] = useState(false)

  // Derivados
  const selectedWard = wards.find(w => w.id === wardId)
  const selectedIndicator = indicators.find(i => i.id === indicatorId)
  const selectedSlug = selectedIndicator?.slug || ''

  // É o caso especial de Recomendações? (mostra 2 campos)
  const isRecomendacao = selectedSlug === 'recomendacao_templo_com_investidura'
  // É Membros Participantes? (mostra campo de membership)
  const isMembrosParticipantes = selectedSlug === 'membros_participantes'

  // ─── Gerar URL do link rápido ───
  const quickLink = selectedWard && selectedSlug
    ? INDICATOR_LINKS[selectedSlug]?.(selectedWard.name) ?? null
    : null

  // ─── Auto-abrir link quando ala + indicador selecionados ───
  useEffect(() => {
    if (quickLink && wardId && indicatorId && !linkOpened) {
      window.open(quickLink, '_blank', 'noopener')
      setLinkOpened(true)
    }
  }, [quickLink, wardId, indicatorId, linkOpened])

  // Reset linkOpened quando muda ala ou indicador
  useEffect(() => {
    setLinkOpened(false)
    setFormError(null)
    setValueRecomSem('')
    setMembershipCount('')
    if (selectedWard && isMembrosParticipantes) {
      setMembershipCount(String(selectedWard.membership_count || ''))
    }
  }, [wardId, indicatorId])

  // ─── Carregar dados iniciais ───
  const fetchRecentEntries = useCallback(async () => {
    const { data } = await supabase
      .from('weekly_indicator_data')
      .select('id, value, week_start, wards(name), indicators(display_name)')
      .order('created_at', { ascending: false })
      .limit(5)
    if (data) setRecentEntries(data as any)
  }, [supabase])

  useEffect(() => {
    async function load() {
      try {
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) { router.push('/login'); return }

        const [wRes, iRes] = await Promise.all([
          supabase.from('wards').select('id, name, membership_count').eq('active', true).order('name'),
          supabase.from('indicators').select('id, display_name, slug, indicator_type').eq('active', true).order('order_index'),
        ])
        if (wRes.data) setWards(wRes.data)
        if (iRes.data) setIndicators(iRes.data)
        await fetchRecentEntries()
      } finally {
        setLoadingData(false)
      }
    }
    load()
  }, [router, supabase, fetchRecentEntries])

  // ─── Submit ───
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)

    try {
      // Validações básicas
      if (!wardId || !indicatorId || !value || !weekStart) {
        setFormError('Preencha todos os campos.')
        return
      }

      const numValue = Number(value)
      const err = validateForm(numValue, weekStart)
      if (err) { setFormError(err); return }

      // Validação extra para Recomendações
      if (isRecomendacao && !valueRecomSem) {
        setFormError('Preencha o valor de membros SEM investidura também.')
        return
      }

      const { data: session } = await supabase.auth.getSession()
      const userId = session.session?.user?.id

      // ─── Insert principal ───
      const { error } = await supabase.from('weekly_indicator_data').insert({
        ward_id: wardId,
        indicator_id: indicatorId,
        value: numValue,
        week_start: weekStart,
        source: 'manual',
        created_by: userId,
      })

      if (error) {
        if (error.code === '23505') {
          setFormError('Este indicador já foi lançado para esta ala neste domingo.')
        } else if (error.code === '23514') {
          setFormError('Dados inválidos. Verifique valor e data.')
        } else {
          setFormError('Erro: ' + error.message)
        }
        return
      }

      let extraSuccess = ''

      // ─── Insert extra: Recomendações SEM investidura ───
      if (isRecomendacao) {
        const semInvIndicator = indicators.find(i => i.slug === 'recomendacao_templo_sem_investidura')
        if (semInvIndicator) {
          const numSem = Number(valueRecomSem)
          const errSem = validateForm(numSem, weekStart)
          if (errSem) { setFormError('Valor SEM investidura: ' + errSem); return }

          const { error: errSemDb } = await supabase.from('weekly_indicator_data').insert({
            ward_id: wardId,
            indicator_id: semInvIndicator.id,
            value: numSem,
            week_start: weekStart,
            source: 'manual',
            created_by: userId,
          })
          if (errSemDb) {
            if (errSemDb.code === '23505') {
              extraSuccess = ' (Sem investidura já existia, mantido.)'
            } else {
              setFormError('Erro no segundo indicador: ' + errSemDb.message)
              return
            }
          } else {
            extraSuccess = ' + Sem investidura salvo!'
          }
        }
      }

      // ─── Update extra: membership_count ───
      if (isMembrosParticipantes && membershipCount) {
        const numMembership = Number(membershipCount)
        if (numMembership > 0 && numMembership <= 10000) {
          await supabase.from('wards')
            .update({ membership_count: numMembership })
            .eq('id', wardId)
          extraSuccess += ' Membros da ala atualizado!'
        }
      }

      setToast({ type: 'success', text: 'Lançamento registrado!' + extraSuccess })
      setValue('')
      setValueRecomSem('')
      setMembershipCount('')
      await fetchRecentEntries()

    } catch (err: any) {
      setFormError('Erro inesperado: ' + (err.message || 'Tente novamente.'))
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Loading ───
  if (loadingData) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: THEME.bg }}>
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: THEME.primary }} />
      </div>
    )
  }

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════

  // Filtrar indicadores no select: esconder "sem investidura" pois é tratado junto com "com investidura"
  const visibleIndicators = indicators.filter(i => i.slug !== 'recomendacao_templo_sem_investidura')

  return (
    <main className="min-h-screen p-4 md:p-12 font-sans transition-all" style={{ backgroundColor: THEME.bg }}>
      <ToastMessage toast={toast} onClose={() => setToast(null)} />

      <div className="mx-auto max-w-3xl">

        {/* HEADER */}
        <div className="mb-8 md:mb-10 text-center md:text-left">
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-2" style={{ color: THEME.textTitle }}>
            Lançamento de Dados
          </h1>
          <p className="text-slate-500 font-semibold uppercase text-[10px] md:text-xs tracking-widest">
            Registre os indicadores semanais da Estaca
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-8">

          {/* ═══ FORMULÁRIO ═══ */}
          <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden relative">
            <div className="h-2 w-full absolute top-0 left-0" style={{ backgroundColor: THEME.primary }}></div>

            <div className="p-5 md:p-10">
              <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">

                {/* Seleção: Ala + Indicador */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                  <div className="space-y-2 md:space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Building2 size={16} className="text-slate-400" /> Ala / Ramo
                    </label>
                    <div className="relative">
                      <select value={wardId} onChange={e => setWardId(e.target.value)} required
                        className="w-full appearance-none rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 md:py-4 text-slate-800 font-bold outline-none focus:border-[#0069a8] focus:bg-white transition-all text-sm md:text-base">
                        <option value="">Selecione...</option>
                        {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <div className="w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1"></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 md:space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Target size={16} className="text-slate-400" /> Indicador
                    </label>
                    <div className="relative">
                      <select value={indicatorId} onChange={e => setIndicatorId(e.target.value)} required
                        className="w-full appearance-none rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 md:py-4 text-slate-800 font-bold outline-none focus:border-[#0069a8] focus:bg-white transition-all text-sm md:text-base">
                        <option value="">Selecione...</option>
                        {visibleIndicators.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.display_name}
                            {i.slug === 'recomendacao_templo_com_investidura' ? ' (com + sem)' : ''}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                        <div className="w-2 h-2 border-r-2 border-b-2 border-slate-400 rotate-45 mb-1"></div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Link rápido da Igreja */}
                {quickLink && (
                  <div className="flex items-center gap-3 p-4 bg-sky-50 border border-sky-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <BookOpen size={18} className="text-sky-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-sky-800">
                        {linkOpened ? 'Link aberto em nova aba!' : 'Abrindo o site da Igreja...'}
                      </p>
                      <p className="text-[10px] text-sky-600 truncate">{quickLink}</p>
                    </div>
                    <button type="button" onClick={() => window.open(quickLink, '_blank', 'noopener')}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-sky-600 text-white text-xs font-bold rounded-xl hover:bg-sky-700 transition-all">
                      <ExternalLink size={14} /> Abrir
                    </button>
                  </div>
                )}

                {/* Data + Valor */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 pt-2">
                  <div className="space-y-2 md:space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Calendar size={16} className="text-slate-400" /> Domingo de Referência
                    </label>
                    <input type="date" value={weekStart} onChange={e => { setWeekStart(e.target.value); setFormError(null) }} required
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-slate-800 font-bold outline-none focus:border-[#0069a8] focus:bg-white transition-all text-sm md:text-base" />
                  </div>

                  <div className="space-y-2 md:space-y-3">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                      <Hash size={16} className="text-slate-400" />
                      {isRecomendacao ? 'COM Investidura' : 'Valor Realizado'}
                    </label>
                    <input type="number" value={value} onChange={e => { setValue(e.target.value); setFormError(null) }} required min={0} max={10000}
                      className="w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3.5 text-xl md:text-2xl font-black text-[#0069a8] outline-none focus:border-[#0069a8] focus:bg-white transition-all placeholder:text-slate-300"
                      placeholder="0" />
                  </div>
                </div>

                {/* Campo extra: Recomendações SEM investidura */}
                {isRecomendacao && (
                  <div className="animate-in fade-in slide-in-from-top-2 space-y-2 md:space-y-3 p-5 bg-amber-50 border border-amber-100 rounded-2xl">
                    <label className="text-xs font-black text-amber-700 uppercase tracking-wider flex items-center gap-2">
                      <Hash size={16} className="text-amber-500" /> SEM Investidura
                    </label>
                    <p className="text-[10px] text-amber-600 -mt-1">Mesmo link do site da Igreja, campo separado aqui.</p>
                    <input type="number" value={valueRecomSem} onChange={e => { setValueRecomSem(e.target.value); setFormError(null) }} min={0} max={10000}
                      className="w-full rounded-xl border-2 border-amber-200 bg-white px-4 py-3.5 text-xl md:text-2xl font-black text-amber-700 outline-none focus:border-amber-400 focus:bg-white transition-all placeholder:text-amber-300"
                      placeholder="0" />
                  </div>
                )}

                {/* Campo extra: Membros Participantes → membership_count */}
                {isMembrosParticipantes && (
                  <div className="animate-in fade-in slide-in-from-top-2 space-y-2 md:space-y-3 p-5 bg-violet-50 border border-violet-100 rounded-2xl">
                    <label className="text-xs font-black text-violet-700 uppercase tracking-wider flex items-center gap-2">
                      <Users size={16} className="text-violet-500" /> Total de Membros da Ala
                    </label>
                    <p className="text-[10px] text-violet-600 -mt-1">
                      Mesmo link traz esse dado. Atualiza o campo de membros da ala para os cálculos proporcionais.
                      {selectedWard && <span className="font-bold"> Valor atual: {selectedWard.membership_count}</span>}
                    </p>
                    <input type="number" value={membershipCount} onChange={e => setMembershipCount(e.target.value)} min={1} max={10000}
                      className="w-full rounded-xl border-2 border-violet-200 bg-white px-4 py-3.5 text-xl md:text-2xl font-black text-violet-700 outline-none focus:border-violet-400 focus:bg-white transition-all placeholder:text-violet-300"
                      placeholder={selectedWard ? String(selectedWard.membership_count) : '0'} />
                  </div>
                )}

                {/* Erro inline */}
                {formError && (
                  <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                    <AlertCircle size={20} className="text-rose-500 shrink-0 mt-0.5" />
                    <span className="font-bold text-sm text-rose-700">{formError}</span>
                  </div>
                )}

                {/* Botão salvar */}
                <button disabled={submitting} type="submit"
                  className="w-full flex items-center justify-center gap-2 text-white font-bold py-4 md:py-5 rounded-xl hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 transition-all text-base md:text-lg shadow-lg shadow-blue-900/10"
                  style={{ backgroundColor: THEME.primary }}>
                  {submitting ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                    <>
                      <Save size={20} />
                      {isRecomendacao ? 'Salvar Ambos Indicadores' : 'Salvar Lançamento'}
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* ═══ HISTÓRICO RECENTE ═══ */}
          <div className="bg-white rounded-[1.5rem] md:rounded-[2rem] shadow-lg border border-slate-200 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 rounded-xl">
                  <History size={20} className="text-slate-500" />
                </div>
                <div>
                  <h2 className="font-black text-slate-800 text-base md:text-lg">Histórico Recente</h2>
                  <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-tighter">Últimos 5 registros</p>
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
                  <div key={entry.id} className="p-4 md:p-6 hover:bg-slate-50 transition-colors flex justify-between items-center group gap-3">
                    <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
                      <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-[#0069a8] font-bold">
                        <Hash size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-700 group-hover:text-[#0069a8] transition-colors truncate text-sm md:text-base">
                          {entry.indicators?.display_name}
                        </span>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mt-0.5 truncate">
                          <Building2 size={12} className="shrink-0" /> {entry.wards?.name}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">{entry.value}</div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 justify-end bg-slate-100 px-2 py-0.5 rounded-full mt-1">
                        <Clock size={10} />
                        {new Date(entry.week_start + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-slate-300 font-bold mt-8 uppercase tracking-widest">
          Chamados a Servir — v1.6.0
        </p>
      </div>
    </main>
  )
}