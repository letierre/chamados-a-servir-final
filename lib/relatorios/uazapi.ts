// Cliente UazAPI para envio de mensagens de texto no WhatsApp.
// Espera duas variáveis de ambiente:
//   UAZAPI_API_URL     — base URL da sua instância (ex: https://oryen.uazapi.com)
//   UAZAPI_ADMIN_TOKEN — token da instância (header "token")

export async function sendWhatsAppText(number: string, text: string): Promise<void> {
  const url = process.env.UAZAPI_API_URL
  const token = process.env.UAZAPI_ADMIN_TOKEN
  if (!url || !token) {
    throw new Error('UazAPI não configurada: defina UAZAPI_API_URL e UAZAPI_ADMIN_TOKEN no .env.local')
  }

  const endpoint = `${url.replace(/\/$/, '')}/send/text`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      token,
    },
    body: JSON.stringify({
      number: number.replace(/\D/g, ''),
      text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`UazAPI respondeu ${res.status}: ${body.slice(0, 300)}`)
  }
}
