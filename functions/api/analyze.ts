import { 
  buildAnalysisPrompt, 
  buildUserMessage, 
  buildErrorMessages, 
  buildStylePrompt, 
  STYLE_IMAGE_CONFIG 
} from './_prompts'
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

async function base64ToBlob(base64: string): Promise<Blob> {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
  const mime = base64.includes(',') ? base64.match(/:(.*?);/)?.[1] || 'image/png' : 'image/png'
  
  const binary = atob(base64Data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

async function sendReportEmail(
  toEmail: string,
  report: string,
  locale: Locale,
  resendApiKey: string,
  styleImage?: string
): Promise<void> {
  const subject = locale === 'ko' ? 'AJY Stylist 스타일 리포트' : 'AJY Stylist Style Report'
  const reportHtml = report.replace(/\n/g, '<br/>')
  const imageHtml = styleImage ? `<div style="margin-top:20px;"><img src="${styleImage}" style="width:100%;max-width:500px;border-radius:12px;"/></div>` : ''
  
  const html = `<html><body style="font-family:sans-serif;color:#333;">
    <h2>${locale === 'ko' ? '나만의 스타일 리포트' : 'Your Style Report'}</h2>
    <div>${reportHtml}</div>
    ${imageHtml}
  </body></html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'AJY Stylist <onboarding@resend.dev>', to: [toEmail], subject, html }),
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { photo, height, weight, gender, locale: rawLocale, user_email } = await context.request.json() as any
    const locale: Locale = rawLocale === 'en' ? 'en' : 'ko'
    const err = buildErrorMessages(locale)
    const apiKey = context.env.OPENAI_API_KEY
    const resendKey = context.env.RESEND_API_KEY

    if (!photo || !apiKey) return new Response(JSON.stringify({ error: err.missingFields }), { status: 400, headers: corsHeaders })

    const prompt = buildAnalysisPrompt(locale, gender, height, weight)
    const userMsg = buildUserMessage(locale, gender, height, weight)
    const stylePrompt = buildStylePrompt()

    console.log('[Analyze] Starting requests...')
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), 28000)

    try {
      // 1. Text Analysis
      const textPromise = fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: [{ type: 'text', text: userMsg }, { type: 'image_url', image_url: { url: photo } }] }],
        }),
      }).then(r => r.json() as any)

      // 2. Image Generation (Edits)
      const imagePromise = (async () => {
        try {
          const imageBlob = await base64ToBlob(photo)
          const formData = new FormData()
          formData.append('image', imageBlob, 'image.png') // Always name it .png
          formData.append('prompt', stylePrompt)
          
          // Apply configs from _prompts.ts
          Object.entries(STYLE_IMAGE_CONFIG).forEach(([key, value]) => {
            formData.append(key, String(value))
          })

          console.log('[Analyze] Sending Image Edit request...')
          const res = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
            body: formData,
          })

          if (!res.ok) {
            const errorBody = await res.text()
            console.error(`[Analyze] Image API Error (${res.status}):`, errorBody)
            // If it's a 429 or credit issue, we'll see it here
            return { error: errorBody, status: res.status }
          }

          const data = await res.json() as any
          const imageData = data.data?.[0]
          return imageData?.b64_json ? `data:image/png;base64,${imageData.b64_json}` : imageData?.url || null
        } catch (e) {
          console.error('[Analyze] Image Exception:', e)
          return { error: (e as Error).message }
        }
      })()

      const [textData, styleImageData] = await Promise.all([textPromise, imagePromise])
      clearTimeout(abortTimer)

      const report = textData.choices?.[0]?.message?.content
      if (!report) throw new Error(err.reportFailed)

      // Check if image generation returned an error object instead of a string
      const styleImage = typeof styleImageData === 'string' ? styleImageData : null
      const imageError = typeof styleImageData === 'object' ? styleImageData : null

      if (user_email && resendKey) {
        sendReportEmail(user_email, report, locale, resendKey, styleImage || undefined).catch(e => console.error('Email failed:', e))
      }

      return new Response(JSON.stringify({ 
        report, 
        styleImage, 
        imageError // 디버깅을 위해 에러 정보 포함
      }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } })

    } catch (unexpectedErr) {
      clearTimeout(abortTimer)
      return new Response(JSON.stringify({ error: (unexpectedErr as Error).message }), { status: 500, headers: corsHeaders })
    }
  } catch (unexpectedErr) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: corsHeaders })
  }
}

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders })
