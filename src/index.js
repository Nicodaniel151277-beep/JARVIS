// J.A.R.V.I.S. – Backend (Cloudflare Worker)
// Phase 1: Status-Endpunkt und KI-Chat mit gestreamten Antworten.

import { LIMITS, SYSTEM_PROMPT, validateMessages, RateLimiter, extractStreamText } from "./lib.js";

const limiter = new RateLimiter(LIMITS.requestsPerMinute);

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return json({ status: "ok", name: "J.A.R.V.I.S.", phase: 1 });
      }

      if (url.pathname === "/api/chat") {
        if (request.method !== "POST") return json({ error: "Methode nicht erlaubt." }, 405);
        return await handleChat(request, env);
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Diese Funktion gibt es (noch) nicht." }, 404);
      }

      // Alles andere: Oberfläche ausliefern
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error("Unerwarteter Fehler:", err);
      return json({ error: "Interner Fehler. Bitte versuchen Sie es erneut." }, 500);
    }
  },
};

async function handleChat(request, env) {
  // Nur Anfragen von der eigenen Webseite zulassen
  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json({ error: "Zugriff nicht erlaubt." }, 403);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "unbekannt";
  if (!limiter.check(ip)) {
    return json(
      { error: "Zu viele Anfragen in kurzer Zeit. Bitte warten Sie eine Minute." },
      429
    );
  }

  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Ungültige Anfrage." }, 415);
  }

  const raw = await request.text();
  if (raw.length > 200_000) return json({ error: "Anfrage zu groß." }, 413);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }

  const result = validateMessages(body?.messages);
  if (!result.ok) return json({ error: result.error }, 400);

  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...result.messages];

  const models = [env.MODEL_PRIMARY, env.MODEL_FALLBACK].filter(Boolean);
  let aiStream = null;
  let lastError = null;
  let usedModel = null;

  for (const model of models) {
    try {
      aiStream = await env.AI.run(model, {
        messages,
        stream: true,
        max_tokens: LIMITS.maxOutputTokens,
      });
      usedModel = model;
      break;
    } catch (err) {
      lastError = err;
      console.error(`Modell ${model} fehlgeschlagen:`, err?.message || err);
      // Bei ausgeschöpftem Kontingent hilft auch das Ersatzmodell nicht
      if (isQuotaError(err)) break;
    }
  }

  if (!aiStream) {
    if (isQuotaError(lastError)) {
      return json(
        {
          error:
            "Das tägliche KI-Kontingent ist aufgebraucht. Es wird jede Nacht zurückgesetzt (01:00 Uhr, im Sommer 02:00 Uhr deutscher Zeit).",
        },
        503
      );
    }
    return json({ error: "Die KI ist gerade nicht erreichbar. Bitte versuchen Sie es gleich erneut." }, 502);
  }

  // Den SSE-Stream von Workers AI in reinen Text umwandeln
  const textStream = aiStream.pipeThrough(sseToText());

  return new Response(textStream, {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Jarvis-Model": usedModel,
    },
  });
}

function sseToText() {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const flushLines = (controller, final) => {
    const lines = buffer.split("\n");
    buffer = final ? "" : lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const text = extractStreamText(trimmed.slice(5).trim());
      if (text) controller.enqueue(encoder.encode(text));
    }
  };

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      flushLines(controller, false);
    },
    flush(controller) {
      buffer += decoder.decode();
      flushLines(controller, true);
    },
  });
}

function isQuotaError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("neuron") ||
    msg.includes("quota") ||
    msg.includes("daily free allocation") ||
    msg.includes("4006")
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
