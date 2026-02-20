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

const STYLE_PROMPT = `You are the best fashion stylist in the world.

Using the attached image, create a single composite image containing three separate vertical panels arranged in a 1×3 horizontal grid (side-by-side).

IMPORTANT STRUCTURE:
Each panel must behave like its own independent vertical 9:16 frame.
The three panels are placed next to each other inside one wide canvas.
No panel may be cropped on the left or right edges.

Left panel: Effortless Daily Styling  
Center panel: Clean Modern Styling  
Right panel: Hip / Trendy Contemporary Styling  

STRICT FRAMING RULES FOR EACH PANEL:

Full body including shoes fully visible.
Wide framing.
Vertical 9:16 composition inside each panel.

Full-length long shot from a distance.
The subject appears smaller within the panel.
The subject occupies only about 50–55% of the panel height.

Large visible empty space above the head.
Clearly visible floor extending below the shoes.

The shoes must be completely visible inside the frame.
The shoes must NOT touch the bottom edge.
The head must NOT touch the top edge.

CRITICAL:
Generous empty space must also exist on BOTH left and right sides of the subject inside each panel.
The subject must not touch or approach the side edges.

Centered subject in each panel.
Standing straight.
Plain clean studio background.
Soft natural lighting.
Balanced negative space.
High-end editorial lookbook photography.
No cropping.
No edge clipping.`

async function base64ToBlob(base64: string): Promise<Blob> {
  const [header, data] = base64.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { photo, gender } = (await context.request.json()) as { photo?: string, gender?: string }

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
    
    // Using the parameters from the user's curl command
    formData.append('image', imageBlob, 'input.jpg')
    formData.append('prompt', STYLE_PROMPT)
    formData.append('model', 'gpt-image-1.5')
    formData.append('n', '1')
    formData.append('size', '1024x1024')
    formData.append('quality', 'auto')
    formData.append('background', 'auto')
    formData.append('moderation', 'auto')
    formData.append('input_fidelity', 'high')
    formData.append('response_format', 'b64_json')

    console.log('[GenerateImage] Sending request to OpenAI Image Edits API...')
    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
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
