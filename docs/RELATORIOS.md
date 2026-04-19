# Módulo de Relatórios WhatsApp

Envio automatizado de relatórios dos indicadores da estaca via WhatsApp, usando a UazAPI.

## 1. Variáveis de ambiente

Adicione ao `.env.local` (dev) e nas **Environment Variables** do Vercel (prod):

```
# Supabase (já existente)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# NOVO — service role (usado pelas rotas /api/relatorios/*)
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# NOVO — UazAPI (suas credenciais)
UAZAPI_API_URL=https://oryen.uazapi.com
UAZAPI_ADMIN_TOKEN=seu-token-da-instancia

# NOVO — segredo do Vercel Cron (gere qualquer string aleatória longa)
CRON_SECRET=alguma-string-aleatoria-bem-longa
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` tem poder total no banco — nunca exponha no cliente.

## 2. Criar tabela no Supabase

Abra o **SQL Editor** do Supabase e rode o conteúdo de [`reports-setup.sql`](./reports-setup.sql).

Isso cria a tabela `report_configs` com RLS ligado (liberado para usuários autenticados).

## 3. Agendamento (Vercel Cron)

O arquivo `vercel.json` na raiz já configura um cron que chama `/api/relatorios/cron` **de hora em hora**.

No deploy Vercel, **adicione o header Authorization automático** na aba *Settings → Cron Jobs* (o Vercel envia `Bearer $CRON_SECRET` automaticamente quando a variável `CRON_SECRET` existe).

- **daily:** dispara todo dia na hora configurada
- **weekly:** dispara na hora configurada, no dia da semana escolhido
- **monthly:** dispara na hora configurada, no dia do mês escolhido

Fuso horário: **America/Sao_Paulo** (calculado no endpoint, independente do fuso do Vercel).

## 4. Testar manualmente

### Enviar agora (botão "Enviar agora" na UI)
```
POST /api/relatorios/send
{ "reportId": "<uuid>" }
```

### Forçar disparo do cron (útil para testar)
```
GET /api/relatorios/cron?secret=<CRON_SECRET>
```

Retorna quais relatórios foram processados, enviados ou pulados.

## 5. Formato da mensagem

Texto puro com emojis e separadores — pronto para WhatsApp:

```
📊 *Resumo Semanal Estaca*
📅 Período: Últimos 90 dias
🏛️ Estaca (11 alas)

━━━━━━━━━━━━━━━

📈 *Batismos*
   Total: 52
   Meta: 66
   Progresso: 78,8%
   🏆 Melhor: Ala Central (9)
   ⚠️ Atenção: Ala Esperança (1)

...

━━━━━━━━━━━━━━━

_Gerado em 19/04/2026, 08:00_
_Chamados a Servir_
```
