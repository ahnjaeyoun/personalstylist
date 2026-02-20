import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { buildAnalysisPrompt, buildUserMessage, buildStyleImagePrompt, buildErrorMessages } from './functions/api/_prompts'
import type { Locale } from './functions/api/_prompts'

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk })
    req.on('end', () => resolve(data))
  })
}

function corsHeaders(methods = 'POST, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function localApiPlugin(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      // ─── /api/checkout ───
      server.middlewares.use('/api/checkout', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders())
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const body = await readBody(req)
          const { embed_origin, locale: rawLocale, customer_email } = JSON.parse(body)
          const locale: Locale = rawLocale === 'en' ? 'en' : 'ko'
          const err = buildErrorMessages(locale)
          const accessToken = process.env.POLAR_ACCESS_TOKEN

          if (!accessToken) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.checkoutNotConfigured }))
            return
          }

          const response = await fetch('https://sandbox-api.polar.sh/v1/checkouts/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              products: ['147c1b35-42a4-4a5d-82a2-865f282be343'],
              ...(embed_origin ? { embed_origin } : {}),
              ...(customer_email ? { customer_email } : {}),
            }),
          })

          if (!response.ok) {
            const errorData = await response.text()
            console.error('Polar API error:', errorData)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.checkoutFailed }))
            return
          }

          const data = await response.json() as { url: string; id: string; client_secret: string }
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() })
          res.end(JSON.stringify({ url: data.url, id: data.id, client_secret: data.client_secret }))
        } catch (unexpectedErr) {
          console.error('Checkout error:', unexpectedErr)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Server error' }))
        }
      })

      // ─── /api/subscription ───
      server.middlewares.use('/api/subscription', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders('GET, OPTIONS'))
          res.end()
          return
        }

        if (req.method !== 'GET') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const url = new URL(req.url!, `http://${req.headers.host}`)
        const email = url.searchParams.get('email')

        if (!email) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Email required' }))
          return
        }

        const polarToken = process.env.POLAR_ACCESS_TOKEN
        if (!polarToken) {
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders('GET, OPTIONS') })
          res.end(JSON.stringify({ hasActiveSubscription: false }))
          return
        }

        try {
          // Step 1: Find customer by email
          const customersRes = await fetch(
            `https://sandbox-api.polar.sh/v1/customers/?email=${encodeURIComponent(email)}&limit=1`,
            { headers: { Authorization: `Bearer ${polarToken}` } }
          )

          let hasActive = false

          if (customersRes.ok) {
            const customersData = await customersRes.json() as { items?: Array<{ id: string }> }
            const customer = customersData.items?.[0]

            if (customer) {
              // Step 2: Get customer state (includes active_subscriptions)
              const stateRes = await fetch(
                `https://sandbox-api.polar.sh/v1/customers/${customer.id}/state`,
                { headers: { Authorization: `Bearer ${polarToken}` } }
              )

              if (stateRes.ok) {
                const state = await stateRes.json() as {
                  active_subscriptions?: Array<{ status: string }>
                }
                hasActive = (state.active_subscriptions?.length ?? 0) > 0
              }
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders('GET, OPTIONS') })
          res.end(JSON.stringify({ hasActiveSubscription: hasActive }))
        } catch (e) {
          console.error('Subscription check error:', e)
          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders('GET, OPTIONS') })
          res.end(JSON.stringify({ hasActiveSubscription: false }))
        }
      })

      // ─── /api/analyze ───
      server.middlewares.use('/api/analyze', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, corsHeaders())
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const body = await readBody(req)
          const { photo, height, weight, gender, locale: rawLocale, checkout_id, user_email } = JSON.parse(body)
          const locale: Locale = rawLocale === 'en' ? 'en' : 'ko'
          const err = buildErrorMessages(locale)

          if (!photo || !height || !weight || !gender) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.missingFields }))
            return
          }

          const apiKey = process.env.OPENAI_API_KEY
          if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.noApiKey }))
            return
          }

          const polarToken = process.env.POLAR_ACCESS_TOKEN
          const resendKey = process.env.RESEND_API_KEY
          const POLAR_API = 'https://sandbox-api.polar.sh'

          // ─── Fetch checkout session for customer email ───────────────────
          let customerEmail: string | null = null
          let checkoutAmount = 0

          if (checkout_id && polarToken) {
            try {
              const sessionRes = await fetch(`${POLAR_API}/v1/checkouts/${checkout_id}`, {
                headers: { Authorization: `Bearer ${polarToken}` },
              })
              if (sessionRes.ok) {
                const sessionData = await sessionRes.json() as { customer_email?: string | null; total_amount?: number }
                customerEmail = sessionData.customer_email ?? null
                checkoutAmount = sessionData.total_amount ?? 0
                console.log(`[analyze] customer_email=${customerEmail} amount=${checkoutAmount}`)
              }
            } catch (e) {
              console.error('Failed to fetch checkout session:', e)
            }
          } else if (user_email) {
            // Subscribed user — no checkout, use their account email
            customerEmail = user_email
          }

          // ─── Refund helpers ──────────────────────────────────────────────
          const findOrderId = async (): Promise<string | null> => {
            if (!checkout_id || !polarToken) return null
            for (let attempt = 0; attempt < 4; attempt++) {
              if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt))
              try {
                const r = await fetch(
                  `${POLAR_API}/v1/orders/?checkout_id=${encodeURIComponent(checkout_id)}&limit=1`,
                  { headers: { Authorization: `Bearer ${polarToken}` } }
                )
                if (!r.ok) continue
                const d = await r.json() as { items?: Array<{ id: string }> }
                if (d.items && d.items.length > 0) return d.items[0].id
              } catch { /* retry */ }
            }
            return null
          }

          const triggerRefund = async (reason: string) => {
            if (!checkout_id || !polarToken || checkoutAmount <= 0) return
            const orderId = await findOrderId()
            if (!orderId) { console.error('Refund: order not found for checkout', checkout_id); return }
            const r = await fetch(`${POLAR_API}/v1/refunds/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${polarToken}` },
              body: JSON.stringify({ order_id: orderId, reason: 'service_disruption', amount: checkoutAmount, comment: reason, revoke_benefits: false }),
            })
            console.log(`[refund] order=${orderId} ok=${r.ok} reason=${reason}`)
          }

          const prompt = buildAnalysisPrompt(locale, gender, height, weight)
          const userMsg = buildUserMessage(locale, gender, height, weight)
          const styleImagePrompt = buildStyleImagePrompt(height, weight)

          // ─── Style image ──────────────────────────────────────────────────
          const base64Match = photo.match(/^data:image\/(.*?);base64,(.*)$/)
          if (!base64Match) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.missingFields }))
            return
          }
          const mimeType = base64Match[1]
          const photoFilename = `photo.${mimeType === 'jpeg' ? 'jpg' : mimeType}`
          const photoBytes = Buffer.from(base64Match[2], 'base64')
          const photoBlob = new Blob([photoBytes], { type: `image/${mimeType}` })

          const generateStyleImage = async (): Promise<string | null> => {
            try {
              const formData = new FormData()
              formData.append('image', photoBlob, photoFilename)
              formData.append('model', 'gpt-image-1.5')
              formData.append('prompt', styleImagePrompt)
              formData.append('n', '1')
              formData.append('size', '1024x1024')
              formData.append('quality', 'auto')
              formData.append('background', 'auto')
              formData.append('moderation', 'auto')
              formData.append('input_fidelity', 'high')

              const imgResponse = await fetch('https://api.openai.com/v1/images/edits', {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiKey}` },
                body: formData,
              })

              if (!imgResponse.ok) {
                const errText = await imgResponse.text()
                throw new Error(`Image API error: ${errText}`)
              }

              const imgData = await imgResponse.json() as { data: Array<{ b64_json: string }> }
              const b64 = imgData.data?.[0]?.b64_json
              if (!b64) throw new Error('No image data returned')
              return `data:image/png;base64,${b64}`
            } catch (imgErr) {
              console.error('Style image generation failed:', imgErr)
              return null
            }
          }

          // ─── Text report ─────────────────────────────────────────────────
          const reportPromise = fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'gpt-5-mini',
              messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: [
                  { type: 'text', text: userMsg },
                  { type: 'image_url', image_url: { url: photo, detail: 'high' } },
                ]},
              ],
            }),
          })

          // ─── Run in parallel ──────────────────────────────────────────────
          let response: Response
          let styleImage: string | null = null

          try {
            const results = await Promise.all([reportPromise, generateStyleImage()])
            response = results[0]
            styleImage = results[1]
          } catch (parallelErr) {
            console.error('Parallel generation failed:', parallelErr)
            await triggerRefund(`Generation failed: ${String(parallelErr)}`)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.analysisFailed, refunded: true }))
            return
          }

          if (!response.ok) {
            const errorData = await response.text()
            console.error('OpenAI API error:', errorData)
            await triggerRefund(`OpenAI error: ${response.status}`)
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.analysisFailed, refunded: true }))
            return
          }

          const data = await response.json() as {
            choices: Array<{ message: { content: string } }>
          }

          const report = data.choices?.[0]?.message?.content

          if (!report) {
            await triggerRefund('Report text extraction failed')
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.reportFailed, refunded: true }))
            return
          }

          // ─── Send email ───────────────────────────────────────────────────
          if (customerEmail && resendKey) {
            const subject = locale === 'ko'
              ? 'AJY Stylist — 나만의 스타일 리포트가 도착했습니다'
              : 'AJY Stylist — Your Personal Style Report'

            fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'AJY Stylist <onboarding@resend.dev>',
                to: [customerEmail],
                subject,
                html: `<p>Your style report is ready. Report text: ${report.substring(0, 100)}...</p>`,
              }),
            }).then(r => console.log(`[email] sent to ${customerEmail} ok=${r.ok}`))
              .catch(e => console.error('[email] send failed:', e))
          }

          res.writeHead(200, { 'Content-Type': 'application/json', ...corsHeaders() })
          res.end(JSON.stringify({ report, styleImage }))
        } catch (unexpectedErr) {
          console.error('Analyze error:', unexpectedErr)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Server error' }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Make env vars available to server plugins via process.env
  Object.assign(process.env, env)

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      host: '0.0.0.0',
    },
  }
})
