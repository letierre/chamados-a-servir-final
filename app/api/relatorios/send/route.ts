import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase/admin'
import { buildReportMessage, type ReportConfig } from '../../../../lib/relatorios/build-message'
import { sendWhatsAppText } from '../../../../lib/relatorios/uazapi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { reportId?: string }
    if (!body.reportId) {
      return NextResponse.json({ error: 'reportId é obrigatório' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('report_configs')
      .select('*')
      .eq('id', body.reportId)
      .single<ReportConfig>()

    if (error || !data) {
      return NextResponse.json({ error: 'Relatório não encontrado' }, { status: 404 })
    }

    const message = await buildReportMessage(supabase, data)

    try {
      await sendWhatsAppText(data.recipient_whatsapp, message)
      await supabase.from('report_configs').update({
        last_sent_at: new Date().toISOString(),
        last_send_status: 'ok',
      }).eq('id', data.id)
      return NextResponse.json({ ok: true, preview: message })
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr)
      await supabase.from('report_configs').update({
        last_sent_at: new Date().toISOString(),
        last_send_status: `error:${msg.slice(0, 200)}`,
      }).eq('id', data.id)
      return NextResponse.json({ error: msg, preview: message }, { status: 502 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
