import { buildErrorMessages } from './_prompts'
import type { Locale } from './_prompts'

interface Env {
  POLAR_ACCESS_TOKEN: string;
}

type PagesFunction<E = unknown> = (context: {
  request: Request;
  env: E;
}) => Response | Promise<Response>;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { embed_origin, locale: rawLocale } = (await context.request.json()) as {
      embed_origin?: string;
      locale?: string;
    };

    const locale: Locale = rawLocale === 'en' ? 'en' : 'ko'
    const err = buildErrorMessages(locale)

    const accessToken = context.env.POLAR_ACCESS_TOKEN;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: err.checkoutNotConfigured }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const response = await fetch("https://sandbox-api.polar.sh/v1/checkouts/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        products: ["147c1b35-42a4-4a5d-82a2-865f282be343"],
        ...(embed_origin ? { embed_origin } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Polar API error:", errorData);
      return new Response(
        JSON.stringify({ error: err.checkoutFailed }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = (await response.json()) as { url: string; id: string; client_secret: string };

    return new Response(
      JSON.stringify({
        url: data.url,
        id: data.id,
        client_secret: data.client_secret,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (unexpectedErr) {
    console.error("Checkout error:", unexpectedErr);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
