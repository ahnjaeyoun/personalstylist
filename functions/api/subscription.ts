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

async function checkSubscriptionByEmail(email: string, polarToken: string): Promise<boolean> {
  // Step 1: Find customer by email
  const customersRes = await fetch(
    `${POLAR_API}/v1/customers/?email=${encodeURIComponent(email)}&limit=1`,
    { headers: { Authorization: `Bearer ${polarToken}` } }
  )

  if (!customersRes.ok) return false

  const customersData = await customersRes.json() as { items?: Array<{ id: string }> }
  const customer = customersData.items?.[0]

  if (!customer) return false

  // Step 2: Get customer state (includes active_subscriptions)
  const stateRes = await fetch(
    `${POLAR_API}/v1/customers/${customer.id}/state`,
    { headers: { Authorization: `Bearer ${polarToken}` } }
  )

  if (!stateRes.ok) return false

  const state = await stateRes.json() as {
    active_subscriptions?: Array<{ status: string }>
  }

  return (state.active_subscriptions?.length ?? 0) > 0
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
    const hasActive = await checkSubscriptionByEmail(email, polarToken)

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
