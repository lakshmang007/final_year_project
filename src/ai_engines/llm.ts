/**
 * LLM connection (Google Gemini) - SERVER ONLY
 *
 * In simple words:
 * This file talks to Google's Gemini large language model for the Generative AI and
 * Agentic AI features. The API key is read from the server's environment variable
 * GEMINI_API_KEY and is never sent to the browser.
 *
 * Model names change over time (Google retires models), so unless GEMINI_MODEL is set we ask
 * the API which models this key can use, try the newest stable "flash" model first, and fall back
 * to the next one if Google says a model is unavailable.
 *
 * Everything else in ai_engines talks to the `ChatModel` interface below, not to Gemini
 * directly, so the agent can also be tested with a scripted fake model (no key needed).
 */
import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ChatTurn {
  text: string;
  toolCalls: ToolCall[];
  /** The model's raw message, appended to the history before sending tool results back */
  content: Content;
}

export interface ChatModel {
  name: string;
  chat(opts: { system: string; history: Content[]; tools?: FunctionDeclaration[] }): Promise<ChatTurn>;
  json<T>(opts: { system: string; prompt: string; schema: object }): Promise<T>;
}

let modelPromise: Promise<ChatModel | null> | null = null;
let lastError = "";

/**
 * Text models this key can call, best first: stable "gemini-<version>-flash" models newest first
 * (3.8 before 2.5), then "gemini-flash-latest", then any other flash text model. No fixed list of
 * names: Google retires models (gemini-2.5-flash stopped serving new users), so we follow the API.
 */
export function rankModels(names: string[]): string[] {
  const version = (n: string) => Number(/^gemini-(\d+(?:\.\d+)?)-flash$/.exec(n)?.[1]);
  const stable = names.filter(n => Number.isFinite(version(n))).sort((a, b) => version(b) - version(a));
  const latest = names.filter(n => n === "gemini-flash-latest");
  const other = names.filter(n => n.includes("flash") && !/image|tts|live|embedding|audio|preview|exp/.test(n));
  return [...new Set([...stable, ...latest, ...other])];
}

/** True when Google says this model can't be used at all (retired, not found, not for this key). */
export function isModelUnavailable(e: any): boolean {
  const msg = String(e?.message ?? e ?? "");
  return e?.status === 404 || /\b404\b|NOT_FOUND|no longer available|not found|not supported for generateContent/i.test(msg);
}

/** True for temporary trouble: the model is overloaded ("high demand", 503) or the call timed out. */
export function isModelBusy(e: any): boolean {
  const msg = String(e?.message ?? e ?? "");
  return e?.status === 503 || e?.name === "AbortError" ||
    /\b503\b|UNAVAILABLE|high demand|overloaded|timed? ?out|deadline|aborted/i.test(msg);
}

// Each Gemini request gives up after 20 s with at most one retry (the SDK's default is 5 attempts
// with up to 60 s between them, which made a busy model look frozen for minutes).
export const REQUEST_TIMEOUT_MS = 20_000;

async function listModels(ai: GoogleGenAI): Promise<string[]> {
  const names: string[] = [];
  const pager = await ai.models.list({ config: { pageSize: 200 } });
  for await (const m of pager) {
    if (m.name && (m.supportedActions ?? []).includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
  }
  return names;
}

/**
 * A ChatModel over a ranked list of model names. If Google answers that a model is unavailable,
 * it moves to the next one and retries, so a retired model never breaks the app.
 */
export function geminiChatModel(ai: Pick<GoogleGenAI, "models">, candidates: string[]): ChatModel {
  let i = 0; // best model that still exists; retired models are skipped for good
  const call = async <R,>(fn: (model: string) => Promise<R>): Promise<R> => {
    // A busy model (overloaded / timed out) is skipped for this call only: it is tried first again next time
    for (let j = i; ; j++) {
      try {
        return await fn(candidates[j]);
      } catch (e) {
        const gone = isModelUnavailable(e), busy = isModelBusy(e);
        if ((!gone && !busy) || j >= candidates.length - 1) throw e;
        console.warn(`Gemini model ${candidates[j]} ${gone ? "unavailable" : "busy"}, trying ${candidates[j + 1]}`);
        if (gone && j === i) i++;
      }
    }
  };
  return {
    get name() { return candidates[i]; },
    async chat({ system, history, tools }) {
      const res = await call(model => ai.models.generateContent({
        model,
        contents: history,
        config: {
          systemInstruction: system,
          temperature: 0.4,
          ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        },
      }));
      const content: Content = res.candidates?.[0]?.content ?? { role: "model", parts: [{ text: res.text ?? "" }] };
      return {
        text: res.text ?? "",
        toolCalls: (res.functionCalls ?? []).map(c => ({ name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> })),
        content,
      };
    },
    async json<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const res = await call(model => ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: system, temperature: 0.7, responseMimeType: "application/json", responseJsonSchema: schema },
      }));
      return JSON.parse(res.text ?? "{}") as T;
    },
  };
}

/** The configured Gemini model, or null when GEMINI_API_KEY is missing or invalid (offline mode). */
export function getChatModel(): Promise<ChatModel | null> {
  if (!process.env.GEMINI_API_KEY) {
    lastError = "GEMINI_API_KEY is not set";
    return Promise.resolve(null);
  }
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const ai = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { timeout: REQUEST_TIMEOUT_MS, retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 3 } },
        });
        const ranked = rankModels(await listModels(ai));
        const candidates = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL, ...ranked.filter(n => n !== process.env.GEMINI_MODEL)] : ranked;
        if (!candidates.length) throw new Error("No Gemini text model available for this API key");
        lastError = "";
        return geminiChatModel(ai, candidates);
      } catch (e: any) {
        lastError = e?.message?.slice(0, 200) || "Could not connect to Gemini";
        modelPromise = null; // retry on the next request
        return null;
      }
    })();
  }
  return modelPromise;
}

/** Rejects with a "timed out" error if `work` takes longer than `ms`. */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`AI timed out after ${ms / 1000} s`)), ms); });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

export async function llmStatus() {
  const model = await getChatModel();
  return { available: !!model, provider: "Google Gemini", model: model?.name ?? null, reason: model ? null : lastError };
}
