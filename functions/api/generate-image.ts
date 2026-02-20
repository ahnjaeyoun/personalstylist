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
  const mime = base64.includes(',') ? base64.match(/:(.*?);/)?.[1] || 'image/jpeg' : 'image/jpeg'
  
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
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    if (!photo) {
      return new Response(
        JSON.stringify({ error: 'Missing photo' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const imageBlob = await base64ToBlob(photo)
    const formData = new FormData()
    formData.append('image', imageBlob, 'input.jpg')
    formData.append('prompt', buildStylePrompt())
    
    // Use config from _prompts.ts
    Object.entries(STYLE_IMAGE_CONFIG).forEach(([key, value]) => {
      formData.append(key, String(value))
    })

    console.log('[GenerateImage] Sending request to OpenAI Image Edits API...')
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[GenerateImage] OpenAI error:', response.status, errorText)
      return new Response(
        JSON.stringify({ error: `Image generation failed: ${response.status} - ${errorText}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const data = await response.json() as { data: Array<{ b64_json?: string; url?: string }> }
    const imageData = data.data?.[0]

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: 'No image data returned' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const image = imageData.b64_json
      ? `data:image/png;base64,${imageData.b64_json}`
      : imageData.url

    return new Response(
      JSON.stringify({ image }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  } catch (err) {
    console.error('[GenerateImage] Unexpected error:', err)
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders })
}
