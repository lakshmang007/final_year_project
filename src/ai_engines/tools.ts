/**
 * Agent Tools - SERVER ONLY
 *
 * In simple words:
 * These are the "hands" of the Kitchen Rescue Agent (AgenticAI.ts). The language model cannot
 * do anything by itself; it can only ask to call one of these functions, and we run them and
 * send the results back. Every tool uses real BioFresh code:
 *   - get_inventory        -> the user's scanned items (Firestore history sent by the app)
 *   - estimate_shelf_life  -> the Arrhenius shelf-life engine (src/lib/science.ts)
 *   - search_knowledge     -> retrieval over the knowledge base (src/lib/ragKnowledge.ts)
 *   - get_weather          -> current temperature/humidity at the user's location
 *   - schedule_reminder    -> asks the app to turn on an expiry alert for an item
 */
import type { FunctionDeclaration } from "@google/genai";
import { calculateDecayRate, calculateRUL, PRODUCE_DATA } from "../lib/science";
import { queryRAGKnowledgeBase } from "../lib/ragKnowledge";

export interface InventoryItem {
  id: string;
  produceType: string;
  qualityScore: number;
  rulHours: number; // shelf life predicted at scan time
  timestamp: string; // ISO time of the scan
  alertEnabled?: boolean;
}

export interface AgentContext {
  inventory: InventoryItem[];
  weather?: { temperature_celsius?: number; humidity_percent?: number; location_name?: string } | null;
  actions: { type: "set_reminder"; item_id: string; produce: string; hours_before_expiry: number }[];
}

const STORAGE_TEMP_C: Record<string, number> = { room: 20, fridge: 4, refrigerator: 4 };

function hoursLeft(item: InventoryItem, now = Date.now()) {
  const elapsed = (now - new Date(item.timestamp).getTime()) / 3_600_000;
  // A scan time in the future (device clock ahead) must not add shelf life
  return Math.max(0, item.rulHours - (Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0));
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_inventory",
    description: "List the produce the user has scanned, most urgent first, with hours of shelf life left.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "estimate_shelf_life",
    description: "Predict remaining shelf life in hours with the Arrhenius kinetics engine for a storage choice.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        produce: { type: "string", description: "Produce id, e.g. banana, tomato, leafy_greens" },
        quality: { type: "number", description: "Freshness/quality score from 0 (rotten) to 1 (fresh)" },
        storage: { type: "string", enum: ["room", "fridge", "outside"], description: "Where it will be stored" },
      },
      required: ["produce", "quality", "storage"],
    },
  },
  {
    name: "search_knowledge",
    description: "Search the BioFresh knowledge base for recipes, storage advice, nutrition or composting steps.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        produce: { type: "string" },
        quality: { type: "number", description: "0..1, selects advice for this freshness level" },
        category: { type: "string", enum: ["recipe", "storage", "nutrition", "upcycling_compost"] },
      },
      required: ["produce"],
    },
  },
  {
    name: "get_weather",
    description: "Current outdoor temperature and humidity at the user's location.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "schedule_reminder",
    description: "Turn on an expiry reminder for one inventory item, a number of hours before it expires.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "id from get_inventory" },
        hours_before_expiry: { type: "number", description: "1 to 72" },
      },
      required: ["item_id", "hours_before_expiry"],
    },
  },
];

/** Runs one tool call and returns a JSON-serialisable result for the model. */
export function runTool(name: string, args: Record<string, any>, ctx: AgentContext): unknown {
  switch (name) {
    case "get_inventory": {
      const items = ctx.inventory
        .map(i => ({ id: i.id, produce: i.produceType, quality: Number(i.qualityScore.toFixed(2)), hours_left: Math.round(hoursLeft(i)), reminder_on: !!i.alertEnabled }))
        .sort((a, b) => a.hours_left - b.hours_left);
      return { count: items.length, items: items.slice(0, 15) };
    }
    case "estimate_shelf_life": {
      const produce = String(args.produce || "").toLowerCase();
      const quality = Math.min(1, Math.max(0, Number(args.quality ?? 0.8)));
      const storage = String(args.storage || "room");
      const tempC = storage === "outside" ? (ctx.weather?.temperature_celsius ?? 25) : (STORAGE_TEMP_C[storage] ?? 20);
      const hours = calculateRUL(quality, calculateDecayRate(produce, tempC + 273.15));
      return { produce, storage, temperature_c: tempC, shelf_life_hours: Math.round(hours), known_produce: produce in PRODUCE_DATA };
    }
    case "search_knowledge": {
      const docs = queryRAGKnowledgeBase(String(args.produce || "all").toLowerCase(), Number(args.quality ?? 0.5), args.category, 3);
      return { results: docs.map(d => ({ title: d.title, category: d.category, summary: d.description, steps: d.actionSteps.slice(0, 4) })) };
    }
    case "get_weather":
      return ctx.weather ?? { note: "No location set; assume a 20°C room" };
    case "schedule_reminder": {
      const item = ctx.inventory.find(i => i.id === args.item_id);
      if (!item) return { ok: false, error: "Unknown item_id. Call get_inventory first." };
      if (hoursLeft(item) < 1 || item.qualityScore < 0.15) {
        return { ok: false, error: "This item has already spoiled; suggest composting it instead of a reminder." };
      }
      const hours = Math.min(72, Math.max(1, Math.round(Number(args.hours_before_expiry) || 12)));
      if (!ctx.actions.some(a => a.item_id === item.id)) {
        ctx.actions.push({ type: "set_reminder", item_id: item.id, produce: item.produceType, hours_before_expiry: hours });
      }
      return { ok: true, item: item.produceType, hours_before_expiry: hours };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export { hoursLeft };
