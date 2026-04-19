import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { buildReportMessage, type ReportConfig } from '../../../../lib/relatorios/build-message'
import { sendWhatsAppText } from '../../../../lib/relatorios/uazapi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Retorna { hour, minute, dayOfMonth, dayOfWeek } no fuso America/Sao_Paulo
function saoPauloNow(): { hour: number; minute: number; dayOfMonth: number; dayOfWeek: number; iso: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hour12: false,
  }).formatToParts(new Date())

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

  return {
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dayOfMonth: Number(get('day')),
    dayOfWeek: wdMap[get('weekday')] ?? 0,
    iso: `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`,
  }
}

function shouldSend(cfg: ReportConfig, now: ReturnType<typeof saoPauloNow>): boolean {
  const [hh] = (cfg.send_time || '00:00').split(':').map(Number)
  if (now.hour !== hh) return false

  if (cfg.frequency === 'daily') return true
  if (cfg.frequency === 'weekly')  return cfg.send_day === now.dayOfWeek
  if (cfg.frequency === 'monthly') return cfg.send_day === now.dayOfMonth
  return false
}

async function runCron() {
  const supabase = createAdminClient()
  const now = saoPauloNow()

  const { data, error } = await supabase
    .from('report_configs')
    .select('*')
    .eq('is_active', true)

  if (error) return { ok: false, error: error.message }
  const configs = (data || []) as ReportConfig[]

  const results: Array<{ id: string; name: string; status: string }> = []
  const today = now.iso.slice(0, 10)

  for (const cfg of configs) {
    if (!shouldSend(cfg, now)) continue

    // Dedup: se já enviou nesta hora, pula
    const rawCfg = cfg as ReportConfig & { last_sent_at?: string | null }
    if (rawCfg.last_sent_at) {
      const lastHour = new Date(rawCfg.last_sent_at).toLocaleString('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
      })
      const nowHour = `${today}, ${String(now.hour).padStart(2, '0')}`
      if (lastHour.startsWith(nowHour)) {
        results.push({ id: cfg.id, name: cfg.name, status: 'skipped-already-sent' })
        continue
      }
    }

    try {
      const message = await buildReportMessage(supabase, cfg)
      await sendWhatsAppText(cfg.recipient_whatsapp, message)
      await supabase.from('report_configs').update({
        last_sent_at: new Date().toISOString(),
        last_send_status: 'ok',
      }).eq('id', cfg.id)
      results.push({ id: cfg.id, name: cfg.name, status: 'sent' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('report_configs').update({
        last_sent_at: new Date().toISOString(),
        last_send_status: `error:${msg.slice(0, 200)}`,
      }).eq('id', cfg.id)
      results.push({ id: cfg.id, name: cfg.name, status: `error:${msg.slice(0, 120)}` })
    }
  }

  return { ok: true, now: now.iso, processed: results.length, results }
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // sem segredo configurado, permite (útil no dev)
  const header = req.headers.get('authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : ''
  const qs = new URL(req.url).searchParams.get('secret') || ''
  return bearer === secret || qs === secret
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await runCron()
  return NextResponse.json(result)
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const result = await runCron()
  return NextResponse.json(result)
}
