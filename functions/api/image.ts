// /functions/api/image.ts
// Cloudflare Pages Functions - POST /api/image
// Body(JSON): { prompt:string, count:number(1..100), model?:string, width?:number, height?:number, referenceImageData?:string(dataURL) }

export interface Env {
  VENICE_API_KEY: string;
  ALLOWED_ORIGIN?: string; // optional CORS origin (e.g., https://scarlett-voss.com)
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
    const { prompt, count, model, width, height, referenceImageData } =
      await request.json().catch(() => ({} as any));

    // Validate
    if (!env.VENICE_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing VENICE_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }
    if (!prompt || typeof prompt !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "prompt is required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }
    let n = Number(count || 1);
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > 100) n = 100;

    // For image generation, use an image-capable model.
    // NOTE: venice-uncensored is a text model; for images we default to venice-sd35 per docs.
    const imageModel = (model && String(model).trim()) || "venice-sd35";

    const w = Number(width) || 1024;
    const h = Number(height) || 1024;

    const headers = {
      "Authorization": `Bearer ${env.VENICE_API_KEY}`,
      "Content-Type": "application/json",
    };

    const results: string[] = [];

    if (referenceImageData) {
      // Image Edit (aka Inpaint / img2img). Endpoint returns binary (image/png)
      // We will loop n times to produce n images.
      const dataUrl = String(referenceImageData);
      const base64 = dataUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");

      for (let i = 0; i < n; i++) {
        const res = await fetch(`${VENICE_BASE}/image/edit`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            prompt,
            image: base64, // base64 without data url prefix
            // You can add optional params if/when the API supports them (e.g., width/height)
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return new Response(
            JSON.stringify({ ok: false, error: `edit failed: ${res.status}`, detail: errText }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
          );
        }

        const blob = await res.arrayBuffer();
        const b64 = arrayBufferToBase64(blob);
        results.push(`data:image/png;base64,${b64}`);
      }
    } else {
      // Text-to-Image Generate. Supports "variants" to get multiple images in one call.
      // To be robust, we chunk large requests.
      let remaining = n;
      while (remaining > 0) {
        const batch = Math.min(remaining, 8); // conservative batch size
        const payload = {
          prompt,
          model: imageModel,
          width: w,
          height: h,
          format: "webp",
          variants: batch,
          // Optional knobs:
          // steps: 20,
          // cfg_scale: 7,
          // safe_mode: false,
        };

        const res = await fetch(`${VENICE_BASE}/image/generate`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          return new Response(
            JSON.stringify({ ok: false, error: `generate failed: ${res.status}`, detail: errText }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
          );
        }

        const json = await res.json();
        // According to docs, response has { images: ["<base64 or URL>"] }
        const imgs: string[] = Array.isArray(json?.images) ? json.images : [];
        for (const img of imgs) {
          if (typeof img === "string") {
            if (img.startsWith("http")) {
              // If API returns URLs in future, just pass through
              results.push(img);
            } else {
              // Assume base64
              results.push(`data:image/webp;base64,${img}`);
            }
          }
        }
        remaining -= batch;
      }
    }

    return new Response(JSON.stringify({ ok: true, images: results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || "unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(env.ALLOWED_ORIGIN) },
    });
  }
};

function arrayBufferToBase64(buf: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
