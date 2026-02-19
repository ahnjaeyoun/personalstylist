export type Locale = 'en' | 'ko'

export function buildAnalysisPrompt(
  locale: Locale,
  gender: string,
  height: string,
  weight: string,
): string {
  if (locale === 'en') {
    const genderLabel = gender === 'male' ? 'Male' : 'Female'
    return `You are an AI-powered fashion styling software. Analyze the user's photo and body information to automatically generate a personalized fashion style report.

User Information:
- Gender: ${genderLabel}
- Height: ${height}cm
- Weight: ${weight}kg

Please write a detailed fashion style report covering the following:

1. **Body Type Analysis**: Analyze the fashion-relevant body type based on the photo and provided information.
2. **Personal Color Recommendation**: Recommend clothing colors that suit the user based on visible skin tone in the photo.
3. **Style Recommendations**: Suggest specific clothing styles that match the body type and vibe (tops, bottoms, outerwear, accessories).
4. **Styles to Avoid**: Identify styles that may not flatter the body type.
5. **Outfit Suggestions**: Propose 3 specific outfit combinations (casual, semi-formal, formal).
6. **Shopping Tips**: Provide size and fit tips for purchasing clothes.

Important Guidelines:
- This report must focus purely on fashion and clothing styling.
- NEVER include health, diet, weight loss, exercise, or medical advice.
- Do NOT negatively judge body shape or suggest weight changes.
- End the report with: "This report is AI-generated fashion reference material and does not replace professional stylist advice."

Write the report in a friendly yet professional tone using markdown format.`
  }

  const genderLabel = gender === 'male' ? '남성' : '여성'
  return `당신은 AI 기반 패션 스타일링 소프트웨어입니다. 사용자의 사진과 체형 정보를 분석하여 맞춤 패션 스타일 보고서를 자동 생성해주세요.

사용자 정보:
- 성별: ${genderLabel}
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

보고서는 친근하면서도 전문적인 톤으로 작성해주세요. 마크다운 형식으로 작성해주세요.`
}

export function buildUserMessage(
  locale: Locale,
  gender: string,
  height: string,
  weight: string,
): string {
  if (locale === 'en') {
    const genderLabel = gender === 'male' ? 'Male' : 'Female'
    return `Gender ${genderLabel}, Height ${height}cm, Weight ${weight}kg`
  }
  const genderLabel = gender === 'male' ? '남성' : '여성'
  return `성별 ${genderLabel}, 키 ${height}, 몸무게 ${weight}`
}

export function buildHairstylePrompt(locale: Locale): string {
  if (locale === 'en') {
    return `Create a 3x3 grid showing 9 different hairstyle variations for this person. Keep the person's face exactly the same in all 9 images. Each cell should show a different trendy hairstyle that would suit this person's face shape and features. Label each style with a short English description. The grid should be clean and well-organized.`
  }
  return `Create a 3x3 grid showing 9 different hairstyle variations for this person. Keep the person's face exactly the same in all 9 images. Each cell should show a different trendy hairstyle that would suit this person's face shape and features. Label each style with a short Korean description. The grid should be clean and well-organized.`
}

export function buildErrorMessages(locale: Locale) {
  if (locale === 'en') {
    return {
      missingFields: 'Please fill in all fields.',
      noApiKey: 'API key is not configured.',
      analysisFailed: 'An error occurred during AI analysis. Please try again later.',
      reportFailed: 'Failed to generate the report.',
      serverError: 'A server error occurred.',
      checkoutNotConfigured: 'Payment is not configured.',
      checkoutFailed: 'Failed to create payment session.',
    }
  }
  return {
    missingFields: '모든 필드를 입력해주세요.',
    noApiKey: 'API 키가 설정되지 않았습니다.',
    analysisFailed: 'AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    reportFailed: '보고서 생성에 실패했습니다.',
    serverError: '서버 오류가 발생했습니다.',
    checkoutNotConfigured: '결제 설정이 완료되지 않았습니다.',
    checkoutFailed: '결제 세션 생성에 실패했습니다.',
  }
}
