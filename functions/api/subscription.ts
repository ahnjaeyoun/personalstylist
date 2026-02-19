const POLAR_API = 'https://sandbox-api.polar.sh'

interface Env {
  POLAR_ACCESS_TOKEN: string
}

type PagesFunction<E = unknown> = (context: {
  request: Request
  env: E
}) => Response | Promise<Response>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const email = url.searchParams.get('email')

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const polarToken = context.env.POLAR_ACCESS_TOKEN
  if (!polarToken) {
    return new Response(JSON.stringify({ hasActiveSubscription: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    const res = await fetch(
      `${POLAR_API}/v1/subscriptions?customer_email=${encodeURIComponent(email)}&limit=10`,
      { headers: { Authorization: `Bearer ${polarToken}` } }
    )

    if (!res.ok) {
      return new Response(JSON.stringify({ hasActiveSubscription: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const data = await res.json() as { items?: Array<{ status: string }> }
    const hasActive = data.items?.some(s => s.status === 'active' || s.status === 'trialing') ?? false

    return new Response(JSON.stringify({ hasActiveSubscription: hasActive }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch {
    return new Response(JSON.stringify({ hasActiveSubscription: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders })
}
