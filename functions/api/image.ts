import { buildStyleImagePrompt } from './_prompts'

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

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { photo, height, weight } = (await context.request.json()) as {
      photo: string
      height: string
      weight: string
    }

    if (!photo || !height || !weight) {
      return new Response(
        JSON.stringify({ styleImage: null }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const apiKey = context.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ styleImage: null }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const styleImagePrompt = buildStyleImagePrompt(height, weight)

    const base64Match = photo.match(/^data:image\/(.*?);base64,(.*)$/)
    if (!base64Match) {
      return new Response(
        JSON.stringify({ styleImage: null }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const mimeType = base64Match[1]
    const binaryString = atob(base64Match[2])
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const photoBlob = new Blob([bytes], { type: `image/${mimeType}` })
    const photoFilename = `photo.${mimeType === 'jpeg' ? 'jpg' : mimeType}`

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
      console.error('Image generation API error:', errText)
      return new Response(
        JSON.stringify({ styleImage: null }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const imgData = await imgResponse.json() as { data: Array<{ b64_json: string }> }
    const b64 = imgData.data?.[0]?.b64_json

    return new Response(
      JSON.stringify({ styleImage: b64 ? `data:image/png;base64,${b64}` : null }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  } catch (err) {
    console.error('Image generation error:', err)
    return new Response(
      JSON.stringify({ styleImage: null }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    )
  }
}

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders })
}
