import type { Locale } from './_prompts'

interface Env {
  RESEND_API_KEY: string;
}

type PagesFunction<E = unknown> = (context: {
  request: Request;
  env: E;
}) => Response | Promise<Response>;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function renderMarkdownToHtml(text: string): string {
  return text
    .replace(/### (.*)/g, '<h3 style="color:#c9b99a;font-size:1rem;margin:1.2em 0 0.4em;">$1</h3>')
    .replace(/## (.*)/g, '<h2 style="color:#e8d5b7;font-size:1.15rem;margin:1.4em 0 0.5em;">$1</h2>')
    .replace(/# (.*)/g, '<h1 style="color:#f5ede0;font-size:1.3rem;margin:1.6em 0 0.6em;">$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#e8d5b7;">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*)/gm, '<li style="margin:0.25em 0;">$1</li>')
    .replace(/(<li.*<\/li>)/s, '<ul style="padding-left:1.5em;margin:0.5em 0;">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:0.75em 0;">')
    .replace(/\n/g, '<br/>')
}

function buildEmailHtml(report: string, hairstyleImage: string | null, locale: Locale): string {
  const reportHtml = renderMarkdownToHtml(report)
  const title = locale === 'ko' ? 'AJY Stylist — 스타일 리포트' : 'AJY Stylist — Style Report'
  const hairstyleTitle = locale === 'ko' ? '추천 헤어스타일' : 'Recommended Hairstyles'
  const disclaimer = locale === 'ko'
    ? '본 보고서는 AI 소프트웨어가 자동 생성한 패션 참고 자료입니다. 전문 스타일리스트의 조언을 대체하지 않습니다.'
    : 'This report is AI-generated fashion reference material. It does not replace professional stylist advice.'
  const footer = locale === 'ko' ? 'AI 패션 스타일링 by AJY Stylist' : 'AI Fashion Styling by AJY Stylist'

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0d0b18;font-family:'Georgia',serif;color:#c9b99a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0b18;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1530 0%,#231d3a 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;border-bottom:1px solid rgba(201,185,154,0.2);">
              <p style="margin:0;font-size:1.6rem;font-weight:700;color:#e8d5b7;letter-spacing:0.08em;">
                AJY <span style="color:#c9b99a;font-weight:400;font-size:1.1rem;">Stylist</span>
              </p>
              <p style="margin:8px 0 0;font-size:0.85rem;color:#7a6f8a;letter-spacing:0.12em;text-transform:uppercase;">
                AI Fashion Styling
              </p>
            </td>
          </tr>

          <!-- Report Body -->
          <tr>
            <td style="background:#131022;padding:36px 40px;">
              <p style="margin:0 0 1em;font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#7a6f8a;">
                ${locale === 'ko' ? 'AI 분석 리포트' : 'AI Analysis Report'}
              </p>
              <p style="margin:0 0 1.5em;color:#f5ede0;font-size:0.75em;">
                ${reportHtml}
              </p>

              ${hairstyleImage ? `
              <!-- Hairstyle Image -->
              <div style="margin-top:2em;border-top:1px solid rgba(201,185,154,0.15);padding-top:1.5em;">
                <p style="margin:0 0 1em;font-size:1rem;font-weight:600;color:#e8d5b7;">${hairstyleTitle}</p>
                <img src="${hairstyleImage}" alt="${hairstyleTitle}" style="width:100%;max-width:520px;border-radius:12px;display:block;margin:0 auto;"/>
              </div>
              ` : ''}

              <!-- Disclaimer -->
              <div style="margin-top:2em;padding:16px 20px;background:rgba(255,255,255,0.04);border-radius:8px;border-left:3px solid rgba(201,185,154,0.4);">
                <p style="margin:0;font-size:0.78rem;color:#7a6f8a;line-height:1.6;">${disclaimer}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0d0b18;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;border-top:1px solid rgba(201,185,154,0.1);">
              <p style="margin:0;font-size:0.8rem;color:#7a6f8a;">${footer}</p>
              <p style="margin:8px 0 0;font-size:0.72rem;color:#4a4560;">© 2026 AJY Stylist. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { email, report, hairstyleImage, locale: rawLocale } = (await context.request.json()) as {
      email: string;
      report: string;
      hairstyleImage?: string | null;
      locale?: string;
    };

    const locale: Locale = rawLocale === 'en' ? 'en' : 'ko'

    if (!email || !report) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const apiKey = context.env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const subject = locale === 'ko'
      ? 'AJY Stylist — 나만의 스타일 리포트가 도착했습니다'
      : 'AJY Stylist — Your Personal Style Report'

    const html = buildEmailHtml(report, hairstyleImage ?? null, locale)

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AJY Stylist <onboarding@resend.dev>',
        to: [email],
        subject,
        html,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error('Resend API error:', errText);
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error('send-email error:', err);
    return new Response(
      JSON.stringify({ error: 'Server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: corsHeaders });
};
