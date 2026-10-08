/**
 * Feedback Memory (learns from user corrections)
 *
 * In simple words:
 * When a user says "this is wrong, it's actually X", we save the photo, the label X and the
 * model's embedding (a 1280-number "fingerprint" of the image) in data/feedback/.
 * On later scans we compare the new photo's fingerprint with the saved ones (cosine
 * similarity). If one is very similar, we use the label the user taught us.
 *
 * The saved photos are also picked up by ml/train.py the next time the model is retrained.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

// FEEDBACK_DIR can point at a persistent disk on the host (e.g. a Render disk mounted at /var/data)
const FEEDBACK_DIR = process.env.FEEDBACK_DIR || path.join(process.cwd(), "data", "feedback");
const FEEDBACK_FILE = path.join(FEEDBACK_DIR, "feedback.json");

export interface FeedbackEntry {
  id: string;
  label: string; // what the user says the item is (snake_case)
  predicted: string; // what the model predicted
  correct: boolean; // true if the user confirmed the prediction
  is_produce: boolean; // false for labels like "human" or "not_produce"
  model_version?: string; // embeddings are only comparable within the same trained model
  image: string; // path relative to data/feedback/
  embedding: number[];
  created_at: string;
}

let cache: FeedbackEntry[] | null = null;

function load(): FeedbackEntry[] {
  if (!cache) {
    try {
      cache = JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8"));
    } catch {
      cache = [];
    }
  }
  return cache!;
}

function save(entries: FeedbackEntry[]) {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  const tmp = FEEDBACK_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(entries));
  fs.renameSync(tmp, FEEDBACK_FILE); // atomic replace so a crash can't corrupt the file
}

/** "Dragon Fruit!" -> "dragon_fruit" */
export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function addFeedback(entry: {
  label: string;
  predicted: string;
  correct: boolean;
  isProduce: boolean;
  jpeg: Buffer;
  modelVersion?: string;
  embedding: Float32Array;
}): FeedbackEntry {
  const entries = load();
  const id = crypto.randomUUID();
  const rel = path.join("images", entry.label, `${id}.jpg`);
  fs.mkdirSync(path.join(FEEDBACK_DIR, "images", entry.label), { recursive: true });
  fs.writeFileSync(path.join(FEEDBACK_DIR, rel), entry.jpeg);

  const saved: FeedbackEntry = {
    id,
    label: entry.label,
    predicted: entry.predicted,
    correct: entry.correct,
    is_produce: entry.isProduce && entry.label !== "not_produce",
    model_version: entry.modelVersion,
    image: rel.replace(/\\/g, "/"),
    embedding: Array.from(entry.embedding, v => Number(v.toFixed(5))),
    created_at: new Date().toISOString(),
  };
  entries.push(saved);
  save(entries);
  return saved;
}

/**
 * Most similar saved feedback image (cosine similarity; embeddings are L2-normalised).
 * On a tie (e.g. the same photo answered twice) the newest answer wins.
 */
export function findClosest(embedding: Float32Array, modelVersion?: string): { entry: FeedbackEntry; similarity: number } | null {
  let best: { entry: FeedbackEntry; similarity: number } | null = null;
  for (const entry of load()) {
    // A retrained model produces different embeddings, so only compare feedback from the same model
    // (the photos themselves are still used by the next `npm run train`)
    if (entry.model_version !== modelVersion || entry.embedding.length !== embedding.length) continue;
    let dot = 0;
    for (let i = 0; i < embedding.length; i++) dot += embedding[i] * entry.embedding[i];
    const tie = best !== null && Math.abs(dot - best.similarity) <= 1e-4;
    // Entries are stored oldest-first, so on a tie the later (newer) entry replaces the earlier one
    if (!best || dot > best.similarity + 1e-4 || tie) best = { entry, similarity: dot };
  }
  return best;
}

export function feedbackStats() {
  const entries = load();
  const byLabel: Record<string, number> = {};
  for (const e of entries) byLabel[e.label] = (byLabel[e.label] || 0) + 1;
  return {
    total: entries.length,
    corrections: entries.filter(e => !e.correct).length,
    confirmations: entries.filter(e => e.correct).length,
    by_label: byLabel,
  };
}
