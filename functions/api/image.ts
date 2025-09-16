// Cloudflare Pages Functions - POST /api/image
// 항상 "1장"만 생성해서 반환합니다.
// Body(JSON): { prompt:string, model?:string, width?:number, height?:number, referenceImageData?:string(dataURL) }

export interface Env {
  VENICE_API_KEY: string;
  ALLOWED_ORIGIN?: string; // e.g., https://scarlett-voss.com
}

const VENICE_BASE = "https://api.venice.ai/api/v1";

function corsHeaders(origin?: string) {
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export const onRequestOptions: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.env.ALLOWED_ORIGIN;
  return new Response(null, { headers: corsHeaders(origin) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = env.ALLOWED_ORIGIN;
  try {
    if (!env.VENICE_API_KEY) {
      return json({ ok:false, error:"Missing VENICE_API_KEY" }, 500, origin);
    }

    const { prompt, model, width, height, referenceImageData } =
      await request.json().catch(() => ({} as any));

    if (!prompt || typeof prompt !== "string") {
      return json({ ok:false, error:"prompt is required" }, 400, origin);
    }

    // venice-uncensored는 텍스트 모델이므로 이미지 가능한 기본 모델을 사용
    const imageModel = (model && String(model).trim()) || "flux-dev-uncensored";
    const w = Math.max(64, Math.min(Number(width) || 1024, 1536));
    const h = Math.max(64, Math.min(Number(height) || 1024, 1536));

    const headers = {
      "Authorization": `Bearer ${env.VENICE_API_KEY}`,
      "Content-Type": "application/json",
    };

    // 참고 이미지가 있으면 edit, 없으면 generate(variants=1)
    if (referenceImageData) {
      const base64 = String(referenceImageData).replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
      const res = await fetch(`${VENICE_BASE}/image/edit`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          prompt,
          image: base64,
          // 필요하면 옵션 추가 (e.g., strength 등)
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return json({ ok:false, error:`edit failed: ${res.status}`, detail: errText }, 502, origin);
      }

      const buf = await res.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      return json({ ok:true, image:`data:image/png;base64,${b64}` }, 200, origin);
    } else {
      const payload = {
        prompt,
        model: imageModel,
        width: w,
        height: h,
        format: "webp",
        variants: 1, // 한 장만 생성
      };

      const res = await fetch(`${VENICE_BASE}/image/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return json({ ok:false, error:`generate failed: ${res.status}`, detail: errText }, 502, origin);
      }

      const jsonRes = await res.json();
      const arr = Array.isArray(jsonRes?.images) ? jsonRes.images : [];
      const first = typeof arr[0] === "string" ? arr[0] : null;

      if (!first) {
        return json({ ok:false, error:"no image returned" }, 502, origin);
      }

      const imageDataUrl = first.startsWith("http")
        ? first
        : `data:image/webp;base64,${first}`;

      return json({ ok:true, image:imageDataUrl }, 200, origin);
    }
  } catch (err: any) {
    return json({ ok:false, error: err?.message || "unknown error" }, 500, origin);
  }
};

function arrayBufferToBase64(buf: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function json(obj: any, status: number, origin?: string) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}
