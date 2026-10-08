/**
 * Tests for the agentic and generative AI engines, using a scripted stand-in for Gemini
 * (no API key or network needed). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatModel, ChatTurn } from "../src/ai_engines/llm";
import { runKitchenAgent, MAX_STEPS } from "../src/ai_engines/AgenticAI";
import { generateRescuePlan } from "../src/ai_engines/GenerativeAI";
import { runTool, type AgentContext } from "../src/ai_engines/tools";

const now = new Date().toISOString();
const ctx = (): AgentContext => ({
  inventory: [
    { id: "a1", produceType: "banana", qualityScore: 0.3, rulHours: 10, timestamp: now },
    { id: "a2", produceType: "apple", qualityScore: 0.95, rulHours: 800, timestamp: now },
  ],
  weather: { temperature_celsius: 30, humidity_percent: 70, location_name: "Bengaluru" },
  actions: [],
});

/** Fake model: returns the scripted turns in order and records what it was sent. */
function scripted(turns: Partial<ChatTurn>[], jsonReply?: unknown) {
  const seen: any[] = [];
  const model: ChatModel = {
    name: "scripted-test-model",
    async chat(opts) {
      seen.push({ ...opts, history: [...opts.history] }); // snapshot: the agent keeps appending to history
      const t = turns.shift() ?? { text: "done", toolCalls: [] };
      return { text: t.text ?? "", toolCalls: t.toolCalls ?? [], content: { role: "model", parts: [{ text: t.text ?? "" }] } };
    },
    async json() { return jsonReply as any; },
  };
  return { model, seen };
}

test("agent calls tools in a loop, records every step, then answers", async () => {
  const { model, seen } = scripted([
    { text: "Let me check what you have.", toolCalls: [{ name: "get_inventory", args: {} }] },
    { toolCalls: [{ name: "estimate_shelf_life", args: { produce: "banana", quality: 0.3, storage: "fridge" } }, { name: "schedule_reminder", args: { item_id: "a1", hours_before_expiry: 6 } }] },
    { text: "- **Banana**: 10 h left. Make banana bread today." },
  ]);
  const c = ctx();
  const r = await runKitchenAgent("What should I cook first?", c, model);
  assert.equal(r.mode, "llm");
  assert.equal(r.model, "scripted-test-model");
  assert.deepEqual(r.steps.map(s => s.tool), ["get_inventory", "estimate_shelf_life", "schedule_reminder"]);
  assert.equal(r.steps[0].thought, "Let me check what you have.");
  assert.match(r.answer, /banana bread/);
  assert.deepEqual(r.actions, [{ type: "set_reminder", item_id: "a1", produce: "banana", hours_before_expiry: 6 }]);
  // tool results were sent back to the model as functionResponse parts
  const lastHistory = seen[2].history;
  const fr = lastHistory[lastHistory.length - 1].parts.map((p: any) => p.functionResponse?.name);
  assert.deepEqual(fr, ["estimate_shelf_life", "schedule_reminder"]);
  // inventory tool lists the most urgent item first
  assert.equal((r.steps[0].result as any).items[0].id, "a1");
});

test("agent stops after MAX_STEPS and still returns a final answer", async () => {
  const loop = Array.from({ length: MAX_STEPS }, () => ({ toolCalls: [{ name: "get_weather", args: {} }] }));
  const { model } = scripted([...loop, { text: "Final answer." }]);
  const r = await runKitchenAgent("loop forever", ctx(), model);
  assert.equal(r.steps.length, MAX_STEPS);
  assert.equal(r.answer, "Final answer.");
});

test("reminder tool rejects unknown items and clamps hours", () => {
  const c = ctx();
  assert.deepEqual(runTool("schedule_reminder", { item_id: "nope", hours_before_expiry: 5 }, c), { ok: false, error: "Unknown item_id. Call get_inventory first." });
  runTool("schedule_reminder", { item_id: "a2", hours_before_expiry: 500 }, c);
  assert.equal(c.actions[0].hours_before_expiry, 72);
});

test("shelf-life tool uses the Arrhenius engine: fridge lasts longer than outside at 30°C", () => {
  const c = ctx();
  const fridge = runTool("estimate_shelf_life", { produce: "banana", quality: 0.8, storage: "fridge" }, c) as any;
  const outside = runTool("estimate_shelf_life", { produce: "banana", quality: 0.8, storage: "outside" }, c) as any;
  assert.equal(outside.temperature_c, 30);
  assert.ok(fridge.shelf_life_hours > outside.shelf_life_hours * 5);
});

test("offline agent (no LLM) runs the same tools and labels itself", async () => {
  const r = await runKitchenAgent("remind me about anything expiring", ctx(), null);
  assert.equal(r.mode, "offline");
  assert.ok(r.steps.some(s => s.tool === "search_knowledge"));
  assert.ok(r.actions.length >= 1);
  assert.match(r.answer, /banana/);
});

test("offline agent with empty inventory asks the user to scan first", async () => {
  const r = await runKitchenAgent("help", { inventory: [], actions: [] }, null);
  assert.match(r.answer, /no scanned produce/i);
});

test("GenAI plan is grounded in retrieved sources and follows the schema", async () => {
  const reply = { headline: "Bake it today [S1]", urgency: "high", safe_to_eat: true, recipes: [{ name: "Banana bread", why: "very ripe", minutes: 60, ingredients: ["3 bananas"], steps: ["Mash", "Bake"] }], storage_tips: ["Keep away from apples"], waste_tip: "Compost the peel" };
  const { model } = scripted([], reply);
  const r = await generateRescuePlan({ produce_type: "banana", quality_score: 0.3, rul_hours: 10 }, model);
  assert.equal(r.mode, "llm");
  assert.ok(r.sources.length > 0, "retrieval found knowledge-base sources");
  assert.equal(r.plan.recipes[0].name, "Banana bread");
});

test("GenAI never returns recipes for rotten produce, even if the model does", async () => {
  const reply = { headline: "x", urgency: "low", safe_to_eat: true, recipes: [{ name: "Rotten smoothie", why: "", minutes: 5, ingredients: [], steps: [] }], storage_tips: [], waste_tip: "" };
  const { model } = scripted([], reply);
  const r = await generateRescuePlan({ produce_type: "tomato", quality_score: 0.02, rul_hours: 0 }, model);
  assert.equal(r.plan.safe_to_eat, false);
  assert.equal(r.plan.recipes.length, 0);
});

test("GenAI offline mode builds a plan from the knowledge base", async () => {
  const r = await generateRescuePlan({ produce_type: "banana", quality_score: 0.5, rul_hours: 30 }, null);
  assert.equal(r.mode, "offline");
  assert.ok(r.plan.headline.length > 0);
  assert.ok(r.plan.storage_tips.length + r.plan.recipes.length > 0);
});

test("reminders are refused for spoiled items; offline agent suggests composting instead", async () => {
  const c: AgentContext = { inventory: [{ id: "t1", produceType: "tomato", qualityScore: 0.02, rulHours: 0, timestamp: now }], actions: [] };
  const res = runTool("schedule_reminder", { item_id: "t1", hours_before_expiry: 12 }, c) as any;
  assert.equal(res.ok, false);
  const r = await runKitchenAgent("remind me", { ...c, actions: [] }, null);
  assert.equal(r.actions.length, 0);
  assert.match(r.answer, /spoiled/);
});

test("a scan time in the future does not add shelf life", () => {
  const future = new Date(Date.now() + 6 * 3_600_000).toISOString();
  const r = runTool("get_inventory", {}, { inventory: [{ id: "f", produceType: "banana", qualityScore: 0.5, rulHours: 20, timestamp: future }], actions: [] }) as any;
  assert.equal(r.items[0].hours_left, 20);
});
