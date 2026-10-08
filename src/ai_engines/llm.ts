/**
 * LLM connection (Google Gemini) - SERVER ONLY
 *
 * In simple words:
 * This file talks to Google's Gemini large language model for the Generative AI and
 * Agentic AI features. The API key is read from the server's environment variable
 * GEMINI_API_KEY and is never sent to the browser.
 *
 * Model names change over time (preview models are retired), so unless GEMINI_MODEL is set
 * we ask the API which models this key can use and pick the newest stable "flash" model.
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

const PREFERRED = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"];
let modelPromise: Promise<ChatModel | null> | null = null;
let lastError = "";

/** Newest stable flash model this key can call, e.g. "gemini-2.5-flash". */
async function pickModel(ai: GoogleGenAI): Promise<string> {
  if (process.env.GEMINI_MODEL) return process.env.GEMINI_MODEL;
  const names: string[] = [];
  const pager = await ai.models.list({ config: { pageSize: 200 } });
  for await (const m of pager) {
    if (m.name && (m.supportedActions ?? []).includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
  }
  for (const p of PREFERRED) if (names.includes(p)) return p;
  const flash = names
    .filter(n => /^gemini-[\d.]+-flash$/.test(n)) // stable flash only (no -lite, -preview, -exp, -tts, -image)
    .sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]));
  if (flash.length) return flash[0];
  const any = names.find(n => n.includes("flash") && !/image|tts|live|embedding/.test(n));
  if (any) return any;
  throw new Error("No Gemini text model available for this API key");
}

function geminiModel(ai: GoogleGenAI, name: string): ChatModel {
  return {
    name,
    async chat({ system, history, tools }) {
      const res = await ai.models.generateContent({
        model: name,
        contents: history,
        config: {
          systemInstruction: system,
          temperature: 0.4,
          ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
        },
      });
      const content: Content = res.candidates?.[0]?.content ?? { role: "model", parts: [{ text: res.text ?? "" }] };
      return {
        text: res.text ?? "",
        toolCalls: (res.functionCalls ?? []).map(c => ({ name: c.name ?? "", args: (c.args ?? {}) as Record<string, unknown> })),
        content,
      };
    },
    async json<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }) {
      const res = await ai.models.generateContent({
        model: name,
        contents: prompt,
        config: { systemInstruction: system, temperature: 0.7, responseMimeType: "application/json", responseJsonSchema: schema },
      });
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
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const name = await pickModel(ai);
        lastError = "";
        return geminiModel(ai, name);
      } catch (e: any) {
        lastError = e?.message?.slice(0, 200) || "Could not connect to Gemini";
        modelPromise = null; // retry on the next request
        return null;
      }
    })();
  }
  return modelPromise;
}

export async function llmStatus() {
  const model = await getChatModel();
  return { available: !!model, provider: "Google Gemini", model: model?.name ?? null, reason: model ? null : lastError };
}
