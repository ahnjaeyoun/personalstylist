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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json() as { email?: string }
  const email = body.email

  if (!email) {
    return new Response(JSON.stringify({ error: 'Email required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  const polarToken = context.env.POLAR_ACCESS_TOKEN
  if (!polarToken) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  try {
    // Step 1: Find customer by email
    const customersRes = await fetch(
      `${POLAR_API}/v1/customers/?email=${encodeURIComponent(email)}&limit=1`,
      { headers: { Authorization: `Bearer ${polarToken}` } }
    )

    if (!customersRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to find customer' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const customersData = await customersRes.json() as { items?: Array<{ id: string }> }
    const customer = customersData.items?.[0]

    if (!customer) {
      return new Response(JSON.stringify({ error: 'Customer not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Step 2: Get customer state to find subscription ID
    const stateRes = await fetch(
      `${POLAR_API}/v1/customers/${customer.id}/state`,
      { headers: { Authorization: `Bearer ${polarToken}` } }
    )

    if (!stateRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to get subscription' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const state = await stateRes.json() as {
      active_subscriptions?: Array<{ id: string; status: string }>
    }

    const subscription = state.active_subscriptions?.[0]
    if (!subscription) {
      return new Response(JSON.stringify({ error: 'No active subscription' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Step 3: Cancel the subscription at period end
    const cancelRes = await fetch(
      `${POLAR_API}/v1/subscriptions/${subscription.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${polarToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cancel_at_period_end: true }),
      }
    )

    if (!cancelRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to cancel subscription' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders })
}
