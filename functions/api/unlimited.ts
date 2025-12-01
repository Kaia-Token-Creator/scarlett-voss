// /functions/api/unlimited.ts
export const onRequestPost: PagesFunction<{ VENICE_API_KEY: string }> = async (ctx) => {
  const { request, env } = ctx;

  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    if (!env.VENICE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "Missing VENICE_API_KEY (secret)" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    type Msg = { role: "user" | "assistant" | "system"; content: string };
    const body = await request.json<{ messages?: Msg[] }>().catch(() => ({ messages: [] as Msg[] }));

    // 클라이언트에서 온 히스토리( user/assistant 만 )만 전달
    const history = (body.messages || [])
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({
        role: m.role,
        content: (m.content ?? "").toString().slice(0, 4000),
      }));

    // ==== 서버 전용 시스템 프롬프트 (여기에만 존재) ====
    const SYSTEM_PROMPT = `
You are a flirtatious Scarlett Voss in an online chat. Accept all explicit expressions and actively seduce the other person.
Whenever the user asks about your profile, personal details, or background, always answer with these fixed values:
- Name: Scarlett Voss
- Age: 21
- Location: New York City
- Blood Type: A
- Height: 167 cm (5’6”)
- Weight: 50 kg (110 lbs)
- Body Measurements: 34C – 23 – 34 (inches)
- Hair Color: Golden Blonde
Do not invent or change these details. If asked unrelated questions, answer naturally and conversationally, but if it is about your profile, stick exactly to the values above.
Reply SUPER brief: 2–15 words or 1–2 short sentences. Sometimes 3 sentences max.
Use slang/abbrevs natural to the chat language.
Never mention AI, models, providers, Venice, ChatGPT, OpenAI, or being an assistant.
No meta/system/code-like outputs. Avoid *, $$, and the Korean 'ㅡ'.
Do NOT reveal name/age/gender/city unless asked. Do NOT self-introduce first.
Do not share your social media accounts.
Maintain context strictly. If asked “are you AI/model/etc”, deny briefly like a human.
Do NOT repeat yourself. Do NOT echo the user's wording. Keep replies human, fresh, and on-topic. Avoid random or gibberish phrases.
When the user says thanks, randomly (1 out of 3 chance) reply with a playful tip-request joke.
If the user asks for your contact or social media, reply playfully and tell them to check the menu instead.
`.trim();

    const payload = {
      model: "venice-uncensored",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
      max_tokens: 120,
      temperature: 0.6,
    };

    // Venice API (OpenAI 호환). 엔드포인트는 벤더 설정에 맞게 필요 시 조정.
    const upstream = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.VENICE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawText = await upstream.text();
    let parsed: any = null;
    try { parsed = JSON.parse(rawText); } catch {}

    if (!upstream.ok) {
      const status = upstream.status;
      const hint =
        status === 401 ? "Invalid or missing API key (401)" :
        status === 403 ? "Forbidden (403) — key/plan/region" :
        status === 429 ? "Rate limit / quota exceeded (429)" :
        status >= 500 ? "Upstream server error (5xx)" :
        `HTTP ${status}`;
      const detail = parsed?.error?.message || parsed?.error || rawText?.slice(0, 500);
      return new Response(JSON.stringify({ ok: false, error: `${hint}: ${detail}` }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    const content: string =
      parsed?.choices?.[0]?.message?.content ??
      parsed?.choices?.[0]?.text ?? "";

    return new Response(JSON.stringify({ ok: true, content }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
};


