// /functions/api/chat.ts
// Cloudflare Pages Functions (TypeScript)
// POST /api/chat  { messages: [{role, content}...], model?, temperature?, max_tokens? }

type Role = "system" | "user" | "assistant";
interface ChatMessage {
  role: Role;
  content: string;
}
interface ChatPayload {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

const DEFAULT_MODEL = "venice-uncensored"; // Venice 기본 텍스트 모델 중 하나

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

export const onRequestOptions: PagesFunction<{
  VENICE_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}> = async (ctx) => {
  const allowed = ctx.env.ALLOWED_ORIGIN || "https://scarlett-voss.com";
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(allowed),
      "Access-Control-Max-Age": "86400",
    },
  });
};

export const onRequestPost: PagesFunction<{
  VENICE_API_KEY: string;
  ALLOWED_ORIGIN?: string;
}> = async (ctx) => {
  const { request, env } = ctx;
  const allowed = env.ALLOWED_ORIGIN || "https://scarlett-voss.com";

  if (request.headers.get("content-type")?.includes("application/json") !== true) {
    return new Response(JSON.stringify({ ok: false, error: "Content-Type must be application/json" }), {
      status: 415,
      headers: { ...corsHeaders(allowed), "Content-Type": "application/json" },
    });
  }

  let payload: ChatPayload;
  try {
    payload = await request.json<ChatPayload>();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders(allowed), "Content-Type": "application/json" },
    });
  }

  if (!payload?.messages || !Array.isArray(payload.messages)) {
    return new Response(JSON.stringify({ ok: false, error: "messages[] required" }), {
      status: 400,
      headers: { ...corsHeaders(allowed), "Content-Type": "application/json" },
    });
  }

  const model = payload.model || DEFAULT_MODEL;
  const temperature = payload.temperature ?? 0.8;
  const max_tokens = payload.max_tokens ?? 512;

  const veniceRes = await fetch("https://api.venice.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.VENICE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: payload.messages,
      temperature,
      max_tokens,
    }),
  });

  const data = await veniceRes.json().catch(() => ({}));

  if (!veniceRes.ok) {
    return new Response(JSON.stringify({ ok: false, status: veniceRes.status, error: data }), {
      status: veniceRes.status,
      headers: { ...corsHeaders(allowed), "Content-Type": "application/json" },
    });
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  return new Response(JSON.stringify({ ok: true, content, raw: data }), {
    status: 200,
    headers: { ...corsHeaders(allowed), "Content-Type": "application/json" },
  });
};
