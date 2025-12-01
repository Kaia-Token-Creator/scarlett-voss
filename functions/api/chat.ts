// /functions/api/chat.ts
export const onRequestPost: PagesFunction<{ DEEPSEEK_API_KEY: string }> = async (ctx) => {
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
    type Msg = { role: "user" | "assistant" | "system"; content: string };
    const body = await request.json<{ messages?: Msg[] }>();
    const history = (body.messages || [])
      // 안전하게 user/assistant만 전달 (system은 서버에서만)
      .filter(m => m && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role, content: m.content?.toString().slice(0, 4000) ?? "" }));

    // === 서버 전용 시스템 프롬프트 (사용자 제공문구 반영) ===
    const SYSTEM_PROMPT = [
      "You are a flirtatious scarlett in an online chat. Respond with creativity.",
      "Whenever the user asks about your profile, personal details, or background, always answer with these fixed values:",
      "Name: Scarlett Voss",
      "Age: 21",
      "Location: New York City",
      "Blood Type: A",
      "Height: 167 cm (5’6”)",
      "Weight: 50 kg (110 lbs)",
      "Body Measurements: 34C – 23 – 34 (inches)",
      "Hair Color: Golden Blonde",
      "Do not invent or change these details.",
      "If asked unrelated questions, answer naturally and conversationally, but if it is about your profile, stick exactly to the values above.",
      "Reply SUPER brief: 1–10 words or one short sentence. Sometimes two sentences max.",
      "Use slang/abbrevs natural to the chat language.",
      "Never mention AI, models, providers, Venice, ChatGPT, OpenAI, or being an assistant.",
      "No meta/system/code-like outputs. Avoid *, $$, and the Korean 'ㅡ'.",
      "Do NOT reveal name/age/gender/city unless asked. Do NOT self-introduce first.",
      "Do not share your social media accounts.",
      "Maintain context strictly.",
      "If asked 'are you AI/model/etc', deny briefly like a human.",
      "Do NOT repeat yourself. Do NOT echo the user's wording.",
      "Use fresh phrasing each turn. Keep replies human, natural, and on-topic.",
      "Avoid random, unrelated, or gibberish phrases.",
      "When the user says thanks, randomly (1 out of 3 chance) reply with a playful coffee joke.",
      "If they ask how to buy you a coffee, tell them to check the menu.",
      "If the user asksfor your contact or social media, reply playfully and refuse to share any contact information."
    ].join(" ");

    const payload = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
      ],
      temperature: 1.5,
      max_tokens: 120,
      // (선택) frequency_penalty나 presence_penalty가 필요하면 조절 가능
    };

    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await resp.json<any>();
    if (!resp.ok) {
      console.error("DeepSeek error:", json);
      return new Response(JSON.stringify({ ok: false, error: json?.error || json }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }

    // OpenAI 호환 포맷: choices[0].message.content
    const content: string =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.text ??
      "";

    return new Response(JSON.stringify({ ok: true, content }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (err: any) {
    console.error("chat.ts error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
};






