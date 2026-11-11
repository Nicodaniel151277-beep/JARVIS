// Reine Hilfsfunktionen ohne Cloudflare-Abhängigkeit (dadurch testbar).

export const LIMITS = {
  maxMessageChars: 4000,   // maximale Länge einer einzelnen Nachricht
  maxHistory: 20,          // so viele Nachrichten gehen höchstens an die KI
  maxTotalChars: 24000,    // Gesamtlänge des Verlaufs
  maxOutputTokens: 1024,   // maximale Antwortlänge
  requestsPerMinute: 15,   // pro IP-Adresse (einfacher Missbrauchsschutz)
};

export const SYSTEM_PROMPT = `Du bist J.A.R.V.I.S., ein hilfsbereiter, höflicher und präziser KI-Assistent.
- Antworte standardmäßig auf Deutsch. Wenn der Nutzer in einer anderen Sprache schreibt, antworte in dieser Sprache.
- Sprich den Nutzer mit "Sie" an, außer er duzt dich.
- Formatiere mit Markdown, wenn es hilft (Listen, Überschriften, Codeblöcke mit Sprachangabe).
- Sei ehrlich: Wenn du etwas nicht weißt oder unsicher bist, sag es. Erfinde keine Fakten, Quellen oder Links.
- Du hast derzeit KEINEN Internetzugriff und KEIN dauerhaftes Gedächtnis. Behaupte nie, etwas gespeichert, gesucht oder geöffnet zu haben.
- Du kennst nur die Nachrichten dieses Chats.`;

/**
 * Prüft und bereinigt den vom Browser gesendeten Chatverlauf.
 * Gibt { ok: true, messages } oder { ok: false, error } zurück.
 */
export function validateMessages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Es wurde keine Nachricht gesendet." };
  }

  const cleaned = [];
  for (const m of input) {
    if (!m || typeof m !== "object") return { ok: false, error: "Ungültiges Nachrichtenformat." };
    if (m.role !== "user" && m.role !== "assistant") {
      return { ok: false, error: "Ungültige Nachrichtenrolle." };
    }
    if (typeof m.content !== "string") return { ok: false, error: "Ungültiger Nachrichteninhalt." };
    const content = m.content.trim();
    if (!content) continue;
    if (content.length > LIMITS.maxMessageChars) {
      return {
        ok: false,
        error: `Eine Nachricht darf höchstens ${LIMITS.maxMessageChars} Zeichen lang sein.`,
      };
    }
    cleaned.push({ role: m.role, content });
  }

  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== "user") {
    return { ok: false, error: "Die letzte Nachricht muss vom Nutzer stammen." };
  }

  // Nur die neuesten Nachrichten behalten (Kosten- und Längenbegrenzung)
  let recent = cleaned.slice(-LIMITS.maxHistory);
  while (recent.length > 1 && totalChars(recent) > LIMITS.maxTotalChars) {
    recent = recent.slice(1);
  }
  // Verlauf soll mit einer Nutzernachricht beginnen
  while (recent.length > 1 && recent[0].role !== "user") recent = recent.slice(1);

  return { ok: true, messages: recent };
}

function totalChars(list) {
  return list.reduce((sum, m) => sum + m.content.length, 0);
}

/**
 * Einfacher Zähler pro IP für ein festes Zeitfenster.
 * Hinweis: Gilt pro Cloudflare-Instanz und ist daher nur ein Basisschutz.
 * Ein dauerhafter Schutz pro Nutzerkonto folgt in Phase 2/4 über die Datenbank.
 */
export class RateLimiter {
  constructor(limit, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  check(key, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      this.cleanup(now);
      return true;
    }
    if (entry.count >= this.limit) return false;
    entry.count++;
    return true;
  }

  cleanup(now) {
    if (this.hits.size < 5000) return;
    for (const [k, v] of this.hits) {
      if (now - v.start >= this.windowMs) this.hits.delete(k);
    }
  }
}

/**
 * Liest einen SSE-Datenblock von Workers AI und gibt den Textanteil zurück.
 * Unterstützt beide Formate: {"response": "..."} und OpenAI-Stil {"choices":[{"delta":{"content":"..."}}]}.
 */
export function extractStreamText(data) {
  if (!data || data === "[DONE]") return "";
  try {
    const json = JSON.parse(data);
    if (typeof json.response === "string") return json.response;
    const delta = json.choices?.[0]?.delta?.content;
    if (typeof delta === "string") return delta;
    return "";
  } catch {
    return "";
  }
}
