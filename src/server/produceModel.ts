/**
 * Local Produce Model (server-side inference)
 *
 * In simple words:
 * Runs our own trained EfficientNet-B0 model (models/produce_model.onnx, trained by
 * ml/train.py on Kaggle fresh/rotten produce datasets) on the uploaded photo.
 * No external AI API or key is needed.
 *
 * Outputs:
 *  - produce_type: the most likely produce class
 *  - quality_score: the model's probability that the item is fresh (0 = rotten, 1 = fresh)
 *  - confidence_score + alternative_candidates: from the type softmax
 */
import fs from "fs";
import path from "path";
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { addFeedback, findClosest, feedbackStats, normalizeLabel } from "./feedbackStore";

const MODEL_DIR = path.join(process.cwd(), "models");
const MODEL_PATH = path.join(MODEL_DIR, "produce_model.onnx");
const LABELS_PATH = path.join(MODEL_DIR, "labels.json");

interface Labels {
  classes: string[];
  input_size: number;
  freshness_untrained_classes?: string[];
  reject_class?: string;
  model_version?: string;
}

let sessionPromise: Promise<{ session: ort.InferenceSession; labels: Labels }> | null = null;

export function modelAvailable(): boolean {
  return fs.existsSync(MODEL_PATH) && fs.existsSync(LABELS_PATH);
}

function loadModel() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const labels: Labels = JSON.parse(fs.readFileSync(LABELS_PATH, "utf8"));
      const session = await ort.InferenceSession.create(MODEL_PATH);
      return { session, labels };
    })();
    // Allow a retry on the next request if loading failed
    sessionPromise.catch(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

const toLabel = (id: string) => id.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");

const PREDICT_TIMEOUT_MS = 30000;
const ASSUMED_QUALITY = 0.8;
const REJECT_CLASS = "not_produce";
// Below this top-class probability the photo is treated as not produce. Tuned on an independent set of
// real-world Wikimedia photos: 0.35 recognised 76.5% of produce while rejecting 93% of non-produce
// (0.5 rejected too many real, slightly unusual produce photos as "not produce").
const MIN_CONFIDENCE = 0.35;
// Between MIN_CONFIDENCE and this, the result is shown as a low-confidence "best guess"
const SURE_CONFIDENCE = 0.5;
// Cosine similarity needed to reuse a user's label: always at STRONG, or at WEAK when the model is unsure
const MEMORY_STRONG_MATCH = 0.9;
const MEMORY_WEAK_MATCH = 0.8;

/** Runs a prediction, failing (instead of hanging the request) if it takes too long. */
export async function predictImage(imageBase64: string) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      sessionPromise = null; // force a clean model reload on the next request
      reject(new Error("Prediction timed out, please try again."));
    }, PREDICT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([runPrediction(imageBase64), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Decodes the photo and runs the ONNX model: class probabilities, freshness and embedding. */
async function infer(imageBase64: string) {
  if (!modelAvailable()) {
    throw new Error("Trained model not found. Run `npm run train` (see README) to create models/produce_model.onnx.");
  }
  const { session, labels } = await loadModel();
  const size = labels.input_size;

  const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const input = Buffer.from(base64Data, "base64");

  // Decode once (auto-rotate from EXIF), then build three views of the photo:
  //   1. the whole photo  2. the central 80% (zooms in on the item)  3. the whole photo mirrored
  // Averaging the model's answers over these views ("test-time augmentation") makes it steadier
  // on real phone photos with clutter around the item.
  const BASE = Math.round(size / 0.8);
  const base = await sharp(input).rotate().resize(BASE, BASE, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const raw = { raw: { width: BASE, height: BASE, channels: 3 as const } };
  const margin = Math.round((BASE - size) / 2);
  const views = await Promise.all([
    sharp(base, raw).resize(size, size, { fit: "fill" }).raw().toBuffer(),
    sharp(base, raw).extract({ left: margin, top: margin, width: size, height: size }).raw().toBuffer(),
    sharp(base, raw).resize(size, size, { fit: "fill" }).flop().raw().toBuffer(),
  ]);

  // HWC uint8 -> NCHW float32 in [0,1] (normalisation is baked into the ONNX graph)
  const plane = size * size;
  const batch = new Float32Array(views.length * 3 * plane);
  views.forEach((data, v) => {
    const o = v * 3 * plane;
    for (let i = 0; i < plane; i++) {
      batch[o + i] = data[i * 3] / 255;
      batch[o + plane + i] = data[i * 3 + 1] / 255;
      batch[o + 2 * plane + i] = data[i * 3 + 2] / 255;
    }
  });

  const out = await session.run({ image: new ort.Tensor("float32", batch, [views.length, 3, size, size]) });
  const n = labels.classes.length;
  const allProbs = out.type_probs.data as Float32Array;
  const probs = Array.from({ length: n }, (_, c) => views.reduce((sum, _v, v) => sum + allProbs[v * n + c], 0) / views.length);
  const fresh = out.fresh_prob.data as Float32Array;
  const dim = out.embedding ? out.embedding.dims[1] : 0;
  return {
    labels,
    input,
    probs,
    freshProb: Array.from(fresh).reduce((a, b) => a + b, 0) / fresh.length,
    // Embedding of the whole-photo view, used to match feedback. Older models had no embedding output.
    embedding: out.embedding ? (out.embedding.data as Float32Array).slice(0, dim) : null,
  };
}

async function runPrediction(imageBase64: string) {
  const { labels, probs, freshProb, embedding } = await infer(imageBase64);
  const reject = labels.reject_class ?? REJECT_CLASS;

  const ranked = probs
    .map((p, i) => ({ type: labels.classes[i], p }))
    .sort((a, b) => b.p - a.p);
  const top = ranked[0];

  // 1. Model decision: unsure predictions are treated as "not produce" rather than guessed
  let type = top.p >= MIN_CONFIDENCE ? top.type : reject;
  let confidence = top.p;
  let source: "model" | "feedback" = "model";

  // 2. Feedback memory: a very similar photo that a user already labelled overrides the model
  const match = embedding ? findClosest(embedding, labels.model_version) : null;
  if (match && match.entry.label !== type) {
    const strong = match.similarity >= MEMORY_STRONG_MATCH;
    const weak = match.similarity >= MEMORY_WEAK_MATCH && (type === reject || top.p < 0.7);
    if (strong || weak) {
      type = match.entry.label;
      confidence = match.similarity;
      source = "feedback";
    }
  }

  // A user label like "human" is remembered as not produce
  const isProduce = source === "feedback" ? match!.entry.is_produce !== false && type !== reject : type !== reject;
  const knownClass = labels.classes.includes(type);
  const freshnessReliable = isProduce && knownClass && !(labels.freshness_untrained_classes ?? []).includes(type);

  return {
    produce_type: type,
    is_produce: isProduce,
    // When the model was never trained on fresh/rotten examples of this type, its freshness
    // output is meaningless, so assume a typical fresh item (0.8) and flag it to the UI.
    quality_score: !isProduce ? 0 : freshnessReliable ? Number(freshProb.toFixed(3)) : ASSUMED_QUALITY,
    confidence_score: Number(confidence.toFixed(3)),
    alternative_candidates: ranked
      .filter(r => r.type !== type && r.type !== reject)
      .slice(0, 3)
      .map(r => ({ type: r.type, label: toLabel(r.type), reason: `Model probability ${(r.p * 100).toFixed(1)}%` })),
    freshness_reliable: freshnessReliable,
    low_confidence: isProduce && source === "model" && confidence < SURE_CONFIDENCE,
    source,
    matched_feedback: match ? { label: match.entry.label, similarity: Number(match.similarity.toFixed(3)) } : null,
    model: "BioFresh EfficientNet-B0 (Kaggle-trained, ONNX)",
  };
}

/**
 * Saves user feedback for a photo: "correct" confirms the prediction, otherwise `label` is
 * what the item really is (any name, e.g. "kiwi" or "not_produce").
 */
export async function recordFeedback(imageBase64: string, predicted: string, label: string, correct: boolean, isProduce: boolean) {
  const { embedding, input, labels } = await infer(imageBase64);
  if (!embedding) throw new Error("This model version has no embedding output; retrain with `npm run train`.");
  const jpeg = await sharp(input).rotate().resize(320, 320, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
  const entry = addFeedback({ label: normalizeLabel(label), predicted, correct, isProduce, jpeg, embedding, modelVersion: labels.model_version });
  return { id: entry.id, label: entry.label, stats: feedbackStats() };
}
