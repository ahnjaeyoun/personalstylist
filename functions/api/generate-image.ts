import { buildStylePrompt, STYLE_IMAGE_CONFIG } from './_prompts'

interface Env {
  OPENAI_API_KEY: string;
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
  // Force image/png for OpenAI Edits API
  const mime = 'image/png'
  
  const binary = atob(base64Data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { photo } = (await context.request.json()) as { photo?: string }

    const apiKey = context.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 500, headers: corsHeaders })
    }

    if (!photo) {
      return new Response(JSON.stringify({ error: 'Missing photo' }), { status: 400, headers: corsHeaders })
    }

    const imageBlob = await base64ToBlob(photo)
    const formData = new FormData()
    formData.append('image', imageBlob, 'image.png')
    formData.append('prompt', buildStylePrompt())
    
    // Copy config but maybe filter non-standard params if they cause 400s
    Object.entries(STYLE_IMAGE_CONFIG).forEach(([key, value]) => {
      formData.append(key, String(value))
    })

    console.log('[GenerateImage] Requesting OpenAI...')
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[GenerateImage] OpenAI error:', response.status, errorText)
      // Return the ACTUAL error from OpenAI so we can debug
      return new Response(
        JSON.stringify({ error: `OpenAI Error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const data = await response.json() as any
    const imageData = data.data?.[0]

    const image = imageData?.b64_json ? `data:image/png;base64,${imageData.b64_json}` : imageData?.url

    return new Response(JSON.stringify({ image }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } })
  } catch (err) {
    console.error('[GenerateImage] Crash:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders })
  }
}

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: corsHeaders })
