/**
 * ==========================================
 * GENERATIVE AI - Personalised Rescue Plan (SERVER ONLY)
 * ==========================================
 *
 * WHAT IT IS:
 * Generative AI creates new content. Here Google Gemini writes a rescue plan (recipes,
 * storage tips, a zero-waste tip) for the exact item the user just scanned.
 *
 * HOW IT WORKS (Retrieval-Augmented Generation, RAG):
 *   1. RETRIEVE: look up the most relevant documents in the BioFresh knowledge base
 *      (src/lib/ragKnowledge.ts) for this produce and freshness level.
 *   2. AUGMENT: put the scan facts (type, freshness, hours left, temperature) and those
 *      documents into the prompt as numbered sources [S1], [S2], ...
 *   3. GENERATE: Gemini returns JSON that follows a fixed schema, so the app can render it.
 * Grounding the model in our own documents keeps advice consistent and reduces made-up facts.
 *
 * Food safety: items the model scored as rotten are never turned into recipes.
 * Without GEMINI_API_KEY a plan is assembled directly from the retrieved documents (mode "offline").
 */
import { getChatModel, type ChatModel } from "./llm";
import { queryRAGKnowledgeBase, type KnowledgeDocument } from "../lib/ragKnowledge";

export interface ScanFacts {
  produce_type: string;
  quality_score: number; // 0..1 from the trained model
  rul_hours: number; // Arrhenius prediction
  temperature_c?: number;
  humidity_percent?: number;
  storage?: string; // room | refrigerator | outside
  freshness_reliable?: boolean;
}

export interface RescuePlan {
  headline: string;
  urgency: "low" | "medium" | "high";
  safe_to_eat: boolean;
  recipes: { name: string; why: string; minutes: number; ingredients: string[]; steps: string[] }[];
  storage_tips: string[];
  waste_tip: string;
}

export interface GenAIResult {
  mode: "llm" | "offline";
  model: string | null;
  plan: RescuePlan;
  sources: { id: string; title: string; category: string }[];
}

const ROTTEN_BELOW = 0.15; // quality below this: compost only

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence: what to do with this item now" },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
    safe_to_eat: { type: "boolean" },
    recipes: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          why: { type: "string", description: "Why it suits this item's ripeness" },
          minutes: { type: "integer" },
          ingredients: { type: "array", items: { type: "string" }, maxItems: 8 },
          steps: { type: "array", items: { type: "string" }, maxItems: 6 },
        },
        required: ["name", "why", "minutes", "ingredients", "steps"],
      },
    },
    storage_tips: { type: "array", items: { type: "string" }, maxItems: 3 },
    waste_tip: { type: "string", description: "How to use scraps/peels or compost" },
  },
  required: ["headline", "urgency", "safe_to_eat", "recipes", "storage_tips", "waste_tip"],
};

const SYSTEM = `You are BioFresh's zero-waste kitchen assistant. Write practical, specific advice for home cooks.
Use the numbered sources when relevant and cite them like [S1]. Keep each step short.
Food safety: if safe_to_eat is false (rotten/mouldy), give NO recipes (empty list) and only composting/disposal advice.
Never give medical claims. Use metric units.`;

function retrieve(f: ScanFacts): KnowledgeDocument[] {
  const seen = new Set<string>();
  const docs: KnowledgeDocument[] = [];
  for (const cat of ["recipe", "storage", "upcycling_compost"] as const) {
    for (const d of queryRAGKnowledgeBase(f.produce_type, f.quality_score, cat, 2)) {
      if (!seen.has(d.id)) { seen.add(d.id); docs.push(d); }
    }
  }
  return docs;
}

export async function generateRescuePlan(f: ScanFacts, model?: ChatModel | null): Promise<GenAIResult> {
  const docs = retrieve(f);
  const sources = docs.map(d => ({ id: d.id, title: d.title, category: d.category }));
  const safe = f.quality_score >= ROTTEN_BELOW;
  const llm = model === undefined ? await getChatModel() : model;
  if (!llm) return { mode: "offline", model: null, plan: offlinePlan(f, docs, safe), sources };

  const facts = [
    `Produce: ${f.produce_type.replace(/_/g, " ")}`,
    `Freshness score: ${(f.quality_score * 100).toFixed(0)}% ${f.freshness_reliable === false ? "(not measured for this type; assumed)" : "(from the trained vision model)"}`,
    `Predicted shelf life left: ${Math.round(f.rul_hours)} hours`,
    `Storage: ${f.storage ?? "room"}${f.temperature_c != null ? `, ${f.temperature_c.toFixed(1)}°C` : ""}${f.humidity_percent != null ? `, ${f.humidity_percent}% humidity` : ""}`,
    `safe_to_eat must be: ${safe}`,
  ].join("\n");
  const context = docs.map((d, i) => `[S${i + 1}] ${d.title} (${d.category}): ${d.description} Steps: ${d.actionSteps.join("; ")}`).join("\n");

  const plan = await llm.json<RescuePlan>({
    system: SYSTEM,
    prompt: `Scan facts:\n${facts}\n\nKnowledge base sources:\n${context || "(none)"}\n\nWrite the rescue plan.`,
    schema: PLAN_SCHEMA,
  });
  return { mode: "llm", model: llm.name, plan: sanitize(plan, safe), sources };
}

/** Enforce the schema and the food-safety rule even if the model ignores them. */
function sanitize(p: Partial<RescuePlan>, safe: boolean): RescuePlan {
  const arr = <T,>(x: unknown, n: number) => (Array.isArray(x) ? (x as T[]).slice(0, n) : []);
  return {
    headline: String(p.headline || ""),
    urgency: (["low", "medium", "high"] as const).includes(p.urgency as any) ? (p.urgency as RescuePlan["urgency"]) : "medium",
    safe_to_eat: safe,
    recipes: safe ? arr<RescuePlan["recipes"][number]>(p.recipes, 2).map(r => ({
      name: String(r.name || ""), why: String(r.why || ""), minutes: Number(r.minutes) || 0,
      ingredients: arr<string>(r.ingredients, 8).map(String), steps: arr<string>(r.steps, 6).map(String),
    })) : [],
    storage_tips: arr<string>(p.storage_tips, 3).map(String),
    waste_tip: String(p.waste_tip || ""),
  };
}

function offlinePlan(f: ScanFacts, docs: KnowledgeDocument[], safe: boolean): RescuePlan {
  const name = f.produce_type.replace(/_/g, " ");
  const recipeDocs = docs.filter(d => d.category === "recipe");
  const storage = docs.find(d => d.category === "storage");
  const compost = docs.find(d => d.category === "upcycling_compost");
  return {
    headline: safe
      ? `Use your ${name} within about ${Math.max(1, Math.round(f.rul_hours))} hours.`
      : `This ${name} looks spoiled: don't eat it, compost it instead.`,
    urgency: !safe || f.rul_hours < 24 ? "high" : f.rul_hours < 72 ? "medium" : "low",
    safe_to_eat: safe,
    recipes: safe ? recipeDocs.slice(0, 2).map(d => ({ name: d.title, why: d.description, minutes: 0, ingredients: [], steps: d.actionSteps.slice(0, 6) })) : [],
    storage_tips: storage ? storage.actionSteps.slice(0, 3) : [],
    waste_tip: compost ? `${compost.title}: ${compost.actionSteps[0] ?? compost.description}` : "Compost peels and scraps instead of binning them.",
  };
}
