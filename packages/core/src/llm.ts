/** Client per API compatibili con OpenAI (OpenRouter, OpenAI, DeepSeek, Ollama, ...). */

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type Msg = { role: "system" | "user" | "assistant"; content: string | (TextPart | ImagePart)[] };

export type LlmConfig = {
  baseUrl: string; // es. https://openrouter.ai/api/v1
  apiKey: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** json_object: il modello deve restituire JSON; none: nessun vincolo (alcuni modelli lo rifiutano) */
  responseFormat?: "json_object" | "none";
};

export type Usage = { prompt: number; completion: number };
export type ChatResult = { text: string; usage?: Usage };
export type ChatOpts = { json?: boolean };
export type ChatFn = (msgs: Msg[], opts?: ChatOpts) => Promise<ChatResult>;

export const PRESETS = {
  openrouter: { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1" },
  ollama: { name: "Ollama (locale)", baseUrl: "http://localhost:11434/v1" },
} as const;

export function makeOpenAiChat(cfg: LlmConfig): ChatFn {
  return async (msgs, opts) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs ?? 180_000);
    try {
      const body: Record<string, unknown> = {
        model: cfg.model,
        messages: msgs,
        temperature: cfg.temperature ?? 0.2,
      };
      if (opts?.json && (cfg.responseFormat ?? "json_object") === "json_object")
        body.response_format = { type: "json_object" };
      const res = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions", {
        method: "POST",
        signal: ctl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
          ...(cfg.headers ?? {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${t.slice(0, 300)}`);
      }
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      const u = data?.usage;
      return {
        text,
        usage: u ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0 } : undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Estrae un oggetto JSON da una risposta, anche se avvolta in ```json ... ``` o preceduta da testo. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : t;
  try {
    return JSON.parse(candidate);
  } catch {
    const a = candidate.indexOf("{");
    const b = candidate.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(candidate.slice(a, b + 1));
    throw new Error("la risposta non contiene JSON valido");
  }
}
