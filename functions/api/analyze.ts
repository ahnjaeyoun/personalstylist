import { buildAnalysisPrompt, buildUserMessage, buildErrorMessages } from './_prompts'
import type { Locale } from './_prompts'

interface Env {
  OPENAI_API_KEY: string;
  POLAR_ACCESS_TOKEN: string;
  RESEND_API_KEY: string;
}

type PagesFunction<E = unknown> = (context: {
  request: Request;
  env: E;
}) => Response | Promise<Response>;

const POLAR_API = 'https://sandbox-api.polar.sh'

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

// ─── Polar helpers ───────────────────────────────────────────────────────────

async function getCheckoutSession(
  checkoutId: string,
  accessToken: string
): Promise<{ customer_email: string | null; total_amount: number } | null> {
  try {
    const res = await fetch(`${POLAR_API}/v1/checkouts/${checkoutId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { customer_email?: string | null; total_amount?: number }
    return {
      customer_email: data.customer_email ?? null,
      total_amount: data.total_amount ?? 0,
    }
  } catch {
    return null
  }
}

async function findOrderIdByCheckout(
  checkoutId: string,
  accessToken: string,
  maxAttempts = 4
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 3000 * attempt))
    }
    try {
      const res = await fetch(
        `${POLAR_API}/v1/orders/?checkout_id=${encodeURIComponent(checkoutId)}&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) continue
      const data = await res.json() as { items?: Array<{ id: string; total_amount: number }> }
      if (data.items && data.items.length > 0) {
        return data.items[0].id
      }
    } catch {
      // continue retry
    }
  }
  return null
}

async function issueRefund(
  orderId: string,
  amount: number,
  accessToken: string,
  reason: string
): Promise<boolean> {
  try {
    const res = await fetch(`${POLAR_API}/v1/refunds/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        order_id: orderId,
        reason: 'service_disruption',
        amount,
        comment: reason,
        revoke_benefits: false,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Email helper ─────────────────────────────────────────────────────────────

function renderMarkdownToHtml(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3 style="color:#c9b99a;font-size:1rem;margin:1.2em 0 0.4em;">$1</h3>')
    .replace(/## (.*)/g, '<h2 style="color:#e8d5b7;font-size:1.15rem;margin:1.4em 0 0.5em;">$1</h2>')
    .replace(/# (.*)/g, '<h1 style="color:#f5ede0;font-size:1.3rem;margin:1.6em 0 0.6em;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e8d5b7;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*)/gm, '<li style="margin:0.25em 0;">$1</li>')
    .replace(/(<li.*<\/li>)/s, '<ul style="padding-left:1.5em;margin:0.5em 0;">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:0.75em 0;">')
    .replace(/\n/g, '<br/>')
}

function buildEmailHtml(report: string, locale: Locale): string {
  const reportHtml = renderMarkdownToHtml(report)
  const disclaimer = locale === 'ko'
    ? '본 보고서는 AI 소프트웨어가 자동 생성한 패션 참고 자료입니다. 전문 스타일리스트의 조언을 대체하지 않습니다.'
    : 'This report is AI-generated fashion reference material. It does not replace professional stylist advice.'
  const footer = locale === 'ko' ? 'AI 패션 스타일링 by AJY Stylist' : 'AI Fashion Styling by AJY Stylist'

  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0b18;font-family:'Georgia',serif;color:#c9b99a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0b18;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#1a1530 0%,#231d3a 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;border-bottom:1px solid rgba(201,185,154,0.2);">
            <p style="margin:0;font-size:1.6rem;font-weight:700;color:#e8d5b7;letter-spacing:0.08em;">AJY <span style="color:#c9b99a;font-weight:400;font-size:1.1rem;">Stylist</span></p>
            <p style="margin:8px 0 0;font-size:0.85rem;color:#7a6f8a;letter-spacing:0.12em;text-transform:uppercase;">AI Fashion Styling</p>
          </td>
        </tr>
        <tr>
          <td style="background:#131022;padding:36px 40px;">
            <p style="margin:0 0 1em;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#7a6f8a;">${locale === 'ko' ? 'AI 분석 리포트' : 'AI Analysis Report'}</p>
            <div style="font-size:0.9em;line-height:1.8;color:#c9b99a;"><p style="margin:0 0 0.75em 0;">${reportHtml}</p></div>
            <div style="margin-top:2em;padding:16px 20px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid rgba(201,185,154,0.4);">
              <p style="margin:0;font-size:0.78rem;color:#7a6f8a;line-height:1.6;">${disclaimer}</p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#0d0b18;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid rgba(201,185,154,0.1);">
            <p style="margin:0;font-size:0.8rem;color:#7a6f8a;">${footer}</p>
            <p style="margin:8px 0 0;font-size:0.72rem;color:#4a4560;">© 2026 AJY Stylist. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendReportEmail(
  toEmail: string,
  report: string,
  locale: Locale,
  resendApiKey: string
): Promise<void> {
  const subject = locale === 'ko'
    ? 'AJY Stylist — 나만의 스타일 리포트가 도착했습니다'
    : 'AJY Stylist — Your Personal Style Report'
  const html = buildEmailHtml(report, locale)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AJY Stylist <onboarding@resend.dev>',
      to: [toEmail],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Resend error:', errText)
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const {
      photo,
      height,
      weight,
      gender,
      locale: rawLocale,
      checkout_id,
      user_email,
    } = (await context.request.json()) as {
      photo: string
      height: string
      weight: string
      gender: string
      locale?: string
      checkout_id?: string
      user_email?: string
    }

    const locale: Locale = rawLocale === 'en' ? 'en' : 'ko'
    const err = buildErrorMessages(locale)

    if (!photo || !height || !weight || !gender) {
      return new Response(
        JSON.stringify({ error: err.missingFields }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const apiKey = context.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: err.noApiKey }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const polarToken = context.env.POLAR_ACCESS_TOKEN
    const resendKey = context.env.RESEND_API_KEY

    // ─── Fetch checkout session details ──────────────────────────────────────
    let customerEmail: string | null = null
    let checkoutAmount = 0

    if (checkout_id && polarToken) {
      const session = await getCheckoutSession(checkout_id, polarToken)
      if (session) {
        customerEmail = session.customer_email
        checkoutAmount = session.total_amount
      }
    } else if (user_email) {
      customerEmail = user_email
    }

    const prompt = buildAnalysisPrompt(locale, gender, height, weight)
    const userMsg = buildUserMessage(locale, gender, height, weight)

    // ─── Helper: trigger refund on failure ───────────────────────────────────
    // quick=true: try only once (no retries), used when we're near the timeout limit
    const triggerRefund = async (reason: string, quick = false) => {
      if (!checkout_id || !polarToken || checkoutAmount <= 0) return
      const orderId = await findOrderIdByCheckout(checkout_id, polarToken, quick ? 1 : 4)
      if (orderId) {
        const ok = await issueRefund(orderId, checkoutAmount, polarToken, reason)
        console.log(`Refund ${ok ? 'succeeded' : 'failed'} for order ${orderId}`)
      } else {
        console.error(`Could not find order for checkout ${checkout_id} to refund`)
      }
    }

    // ─── Text report generation only ─────────────────────────────────────────
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 28000)

    let reportResponse: Response
    try {
      reportResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: prompt,
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: userMsg },
                { type: 'image_url', image_url: { url: photo } },
              ],
            },
          ],
        }),
      })
      clearTimeout(abortTimer)
    } catch (fetchErr) {
      clearTimeout(abortTimer)
      console.error('OpenAI fetch error:', fetchErr)
      // quick=true: skip retries to stay within Cloudflare's 30s wall-clock limit
      await triggerRefund('OpenAI fetch timeout or error', true)
      return new Response(
        JSON.stringify({ error: err.analysisFailed, refunded: !!checkout_id }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    if (!reportResponse.ok) {
      const errorData = await reportResponse.text()
      console.error('OpenAI API error:', errorData)
      await triggerRefund(`OpenAI report API error: ${reportResponse.status}`)
      return new Response(
        JSON.stringify({ error: err.analysisFailed, refunded: true }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const data = await reportResponse.json() as {
      choices: Array<{
        message: { content: string }
      }>
    }

    const report = data.choices?.[0]?.message?.content

    if (!report) {
      await triggerRefund('Report text extraction failed')
      return new Response(
        JSON.stringify({ error: err.reportFailed, refunded: true }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    // ─── Send email ───────────────────────────────────────────────────────────
    if (customerEmail && resendKey) {
      sendReportEmail(customerEmail, report, locale, resendKey).catch(e => {
        console.error('Email send failed:', e)
      })
    }

    return new Response(
      JSON.stringify({ report }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  } catch (unexpectedErr) {
    console.error('Unexpected error:', unexpectedErr)
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders })
}
