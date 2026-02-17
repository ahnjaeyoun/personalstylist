interface Env {
  OPENAI_API_KEY: string;
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
    const { photo, height, weight, gender } = (await context.request.json()) as {
      photo: string;
      height: string;
      weight: string;
      gender: string;
    };

    if (!photo || !height || !weight || !gender) {
      return new Response(
        JSON.stringify({ error: "모든 필드를 입력해주세요." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const apiKey = context.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API 키가 설정되지 않았습니다." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const prompt = `당신은 AI 기반 패션 스타일링 소프트웨어입니다. 사용자의 사진과 체형 정보를 분석하여 맞춤 패션 스타일 보고서를 자동 생성해주세요.

사용자 정보:
- 성별: ${gender}
- 키: ${height}cm
- 몸무게: ${weight}kg

다음 항목들을 포함한 상세한 패션 스타일 보고서를 작성해주세요:

1. **체형 분석**: 사진과 제공된 정보를 바탕으로 패션 관점에서의 체형 타입을 분석해주세요.
2. **퍼스널 컬러 추천**: 사진에서 보이는 피부톤을 기반으로 어울리는 의류 컬러를 추천해주세요.
3. **스타일 추천**: 체형과 분위기에 맞는 옷 스타일을 구체적으로 추천해주세요 (상의, 하의, 아우터, 액세서리 포함).
4. **피해야 할 스타일**: 체형에 맞지 않아 피하면 좋을 스타일을 알려주세요.
5. **코디 제안**: 3가지 구체적인 코디 조합을 제안해주세요 (캐주얼, 세미포멀, 포멀).
6. **쇼핑 팁**: 옷을 구매할 때 참고할 사이즈 및 핏 관련 팁을 알려주세요.

중요 지침:
- 이 보고서는 순수하게 패션과 의류 스타일링에만 집중하세요.
- 건강, 다이어트, 체중 감량, 운동, 의학적 조언은 절대 포함하지 마세요.
- 체형을 부정적으로 평가하거나 체중 변화를 권유하지 마세요.
- 보고서 마지막에 "본 보고서는 AI가 자동 생성한 패션 참고 자료이며, 전문 스타일리스트의 조언을 대체하지 않습니다."라는 문구를 포함해주세요.

보고서는 친근하면서도 전문적인 톤으로 작성해주세요. 마크다운 형식으로 작성해주세요.`;

    // Build hairstyle image request
    const hairstylePrompt = `Create a 3x3 grid showing 9 different hairstyle variations for this person. Keep the person's face exactly the same in all 9 images. Each cell should show a different trendy hairstyle that would suit this person's face shape and features. Label each style with a short Korean description. The grid should be clean and well-organized.`;

    const generateHairstyleImage = async (): Promise<string | null> => {
      try {
        // Extract base64 data from data URL
        const base64Match = photo.match(/^data:image\/(.*?);base64,(.*)$/);
        if (!base64Match) return null;

        const mimeType = base64Match[1];
        const base64Data = base64Match[2];

        // Convert base64 to binary
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: `image/${mimeType}` });

        const formData = new FormData();
        formData.append("image", blob, `photo.${mimeType === "jpeg" ? "jpg" : mimeType}`);
        formData.append("model", "gpt-image-1.5");
        formData.append("prompt", hairstylePrompt);
        formData.append("size", "1024x1024");
        formData.append("quality", "auto");
        formData.append("input_fidelity", "high");

        const imgResponse = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        });

        if (!imgResponse.ok) {
          const errText = await imgResponse.text();
          console.error("Image generation API error:", errText);
          return null;
        }

        const imgData = (await imgResponse.json()) as {
          data: Array<{ b64_json: string }>;
        };

        const b64 = imgData.data?.[0]?.b64_json;
        if (!b64) return null;

        return `data:image/png;base64,${b64}`;
      } catch (err) {
        console.error("Hairstyle image generation failed:", err);
        return null;
      }
    };

    // Run text report and hairstyle image generation in parallel
    const reportPromise = fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "developer",
            content: [
              { type: "input_text", text: prompt },
            ],
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: `성별 ${gender}, 키 ${height}, 몸무게 ${weight}` },
              {
                type: "input_image",
                image_url: photo,
              },
            ],
          },
        ],
        reasoning: {},
        store: true,
      }),
    });

    const [response, hairstyleImage] = await Promise.all([
      reportPromise,
      generateHairstyleImage(),
    ]);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI API error:", errorData);
      return new Response(
        JSON.stringify({ error: "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = (await response.json()) as {
      output: Array<{
        type: string;
        content?: Array<{ type: string; text: string }>;
      }>;
    };

    const messageOutput = data.output?.find(
      (item: { type: string }) => item.type === "message"
    );
    const textContent = messageOutput?.content?.find(
      (c: { type: string }) => c.type === "output_text"
    );
    const report = textContent?.text;
    if (!report) {
      return new Response(
        JSON.stringify({ error: "보고서 생성에 실패했습니다." }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ report, hairstyleImage: hairstyleImage ?? null }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
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
