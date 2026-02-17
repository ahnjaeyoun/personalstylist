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
    const accessToken = context.env.POLAR_ACCESS_TOKEN;
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: "결제 설정이 완료되지 않았습니다." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { embed_origin } = (await context.request.json()) as {
      embed_origin?: string;
    };

    const response = await fetch("https://sandbox-api.polar.sh/v1/checkouts/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        products: ["0ec55ba6-ad1f-4807-a22e-ab661604b5c4"],
        ...(embed_origin ? { embed_origin } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Polar API error:", errorData);
      return new Response(
        JSON.stringify({ error: "결제 세션 생성에 실패했습니다." }),
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
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(
      JSON.stringify({ error: "서버 오류가 발생했습니다." }),
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
