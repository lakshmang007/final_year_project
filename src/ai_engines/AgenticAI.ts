/**
 * ==========================================
 * AGENTIC AI - Kitchen Rescue Agent (SERVER ONLY)
 * ==========================================
 *
 * WHAT IT IS:
 * An "agent" is an AI system that is given a GOAL and decides by itself which TOOLS to use,
 * in which order, until the goal is reached. A plain chatbot only writes text; an agent acts.
 *
 * HOW IT WORKS HERE (tool-calling loop, a.k.a. ReAct):
 *   1. The user's goal (e.g. "What should I cook first?") is sent to Gemini together with the
 *      list of tools in tools.ts (inventory, Arrhenius shelf-life engine, knowledge base,
 *      weather, reminders).
 *   2. Gemini answers either with a final reply, or with one or more TOOL CALLS.
 *   3. We run the requested tools on the server and send their results back (OBSERVATION).
 *   4. Repeat until Gemini gives a final answer, or MAX_STEPS is reached.
 * Every step is returned to the app, which shows the agent's full trace.
 *
 * Side effects are limited and safe: the agent can only *request* reminders for the user's own
 * items (returned as `actions`); the app applies them to the user's Firestore records.
 *
 * Without GEMINI_API_KEY the same tools are run by a fixed offline plan (mode: "offline"),
 * so the feature keeps working and is clearly labelled.
 */
import type { Content } from "@google/genai";
import { getChatModel, type ChatModel } from "./llm";
import { TOOL_DECLARATIONS, runTool, hoursLeft, type AgentContext } from "./tools";

export const MAX_STEPS = 6;

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  thought?: string;
}

export interface AgentResult {
  mode: "llm" | "offline";
  model: string | null;
  answer: string;
  steps: AgentStep[];
  actions: AgentContext["actions"];
}

const SYSTEM = `You are the BioFresh Kitchen Rescue Agent. Your job is to help the user waste less food.
Rules:
- Use tools for facts. Never invent items: call get_inventory before talking about what the user has.
- Use estimate_shelf_life to compare storage options and search_knowledge for recipes and storage advice.
- Only call schedule_reminder when the user asks for reminders/alerts, or for items with under 24 hours left.
- Items with 0 hours left or quality under 0.15 are spoiled: never suggest eating them, suggest composting.
- Final answer: friendly, under 180 words, markdown bullets, most urgent item first. Mention hours left.
- If the inventory is empty, say so and suggest scanning produce first.`;

export async function runKitchenAgent(goal: string, ctx: AgentContext, model?: ChatModel | null): Promise<AgentResult> {
  const llm = model === undefined ? await getChatModel() : model;
  if (!llm) return runOfflinePlan(goal, ctx);

  const history: Content[] = [{ role: "user", parts: [{ text: goal }] }];
  const steps: AgentStep[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const turn = await llm.chat({ system: SYSTEM, history, tools: TOOL_DECLARATIONS });
    history.push(turn.content);
    if (!turn.toolCalls.length) {
      return { mode: "llm", model: llm.name, answer: turn.text.trim(), steps, actions: ctx.actions };
    }
    const responses = turn.toolCalls.map(call => {
      const result = runTool(call.name, call.args, ctx);
      steps.push({ tool: call.name, args: call.args, result, thought: turn.text.trim() || undefined });
      return { functionResponse: { name: call.name, response: { result } } };
    });
    history.push({ role: "user", parts: responses });
  }
  // Out of steps: ask for a final answer without tools
  history.push({ role: "user", parts: [{ text: "Give your final answer now, without calling more tools." }] });
  const final = await llm.chat({ system: SYSTEM, history });
  return { mode: "llm", model: llm.name, answer: final.text.trim(), steps, actions: ctx.actions };
}

/** Same tools, fixed order: used when no LLM is configured. */
function runOfflinePlan(goal: string, ctx: AgentContext): AgentResult {
  const steps: AgentStep[] = [];
  const call = (tool: string, args: Record<string, unknown> = {}) => {
    const result = runTool(tool, args, ctx);
    steps.push({ tool, args, result });
    return result as any;
  };

  const inv = call("get_inventory");
  if (!inv.count) {
    return { mode: "offline", model: null, answer: "You have no scanned produce yet. Scan a fruit or vegetable first, then ask me again.", steps, actions: ctx.actions };
  }
  const wantsReminders = /remind|alert|notify/i.test(goal);
  const lines: string[] = [];
  for (const item of inv.items.slice(0, 3)) {
    const fridge = call("estimate_shelf_life", { produce: item.produce, quality: item.quality, storage: "fridge" });
    const kb = call("search_knowledge", { produce: item.produce, quality: item.quality, category: item.hours_left < 48 ? "recipe" : "storage" });
    const name = item.produce.replace(/_/g, " ");
    if (item.hours_left < 1 || item.quality < 0.15) {
      const compost = call("search_knowledge", { produce: item.produce, quality: 0, category: "upcycling_compost" });
      lines.push(`- **${name}**: already spoiled. Don't eat it; ${compost.results[0]?.title ? `try **${compost.results[0].title}**` : "compost it"}.`);
      continue;
    }
    if (item.hours_left < 24 || wantsReminders) call("schedule_reminder", { item_id: item.id, hours_before_expiry: Math.min(12, Math.max(1, Math.floor(item.hours_left / 2))) });
    const tip = kb.results[0]?.title ? ` Try: **${kb.results[0].title}**.` : "";
    lines.push(`- **${name}**: ${item.hours_left} h left at its current storage, about ${fridge.shelf_life_hours} h in the fridge.${tip}`);
  }
  const reminders = ctx.actions.length ? `\n\nReminders turned on for: ${ctx.actions.map(a => a.produce.replace(/_/g, " ")).join(", ")}.` : "";
  return {
    mode: "offline",
    model: null,
    answer: `Most urgent first:\n${lines.join("\n")}${reminders}`,
    steps,
    actions: ctx.actions,
  };
}

export { hoursLeft };
