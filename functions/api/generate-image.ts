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

function buildStylePrompt(gender: string): string {
  const subject = gender === 'male' ? 'a young man' : 'a young woman'
  return `A high-end editorial lookbook photograph showing three full-body fashion shots of ${subject}, arranged side by side as a 1×3 horizontal grid on a single wide canvas.

Left panel label: Effortless Daily Styling — casual, relaxed, everyday wear.
Center panel label: Clean Modern Styling — minimal, structured, contemporary.
Right panel label: Hip / Trendy Contemporary Styling — bold, fashionable, current street trends.

Rules for every panel:
- Full body visible from head to toe including shoes.
- The subject occupies about 50% of the panel height, centered.
- Generous empty space above the head and below the shoes.
- Generous empty space on both left and right sides of the subject.
- Plain clean studio background, soft natural lighting.
- Standing straight, balanced posture.
- High-end editorial photography style, no cropping, no edge clipping.`
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { gender } = (await context.request.json()) as { gender?: string }

    const apiKey = context.env.OPENAI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      )
    }

    const prompt = buildStylePrompt(gender ?? 'female')

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard',
        response_format: 'b64_json',
      }),
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
