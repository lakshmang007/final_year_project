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

const MODEL_DIR = path.join(process.cwd(), "models");
const MODEL_PATH = path.join(MODEL_DIR, "produce_model.onnx");
const LABELS_PATH = path.join(MODEL_DIR, "labels.json");

interface Labels {
  classes: string[];
  input_size: number;
  freshness_untrained_classes?: string[];
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

async function runPrediction(imageBase64: string) {
  if (!modelAvailable()) {
    throw new Error("Trained model not found. Run `npm run train` (see README) to create models/produce_model.onnx.");
  }
  const { session, labels } = await loadModel();
  const size = labels.input_size;

  const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const input = Buffer.from(base64Data, "base64");

  // Decode, auto-rotate (EXIF), resize to model input, raw RGB bytes
  const { data } = await sharp(input)
    .rotate()
    .resize(size, size, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // HWC uint8 -> NCHW float32 in [0,1] (normalisation is baked into the ONNX graph)
  const plane = size * size;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    chw[i] = data[i * 3] / 255;
    chw[plane + i] = data[i * 3 + 1] / 255;
    chw[2 * plane + i] = data[i * 3 + 2] / 255;
  }

  const out = await session.run({ image: new ort.Tensor("float32", chw, [1, 3, size, size]) });
  const probs = Array.from(out.type_probs.data as Float32Array);
  const freshProb = (out.fresh_prob.data as Float32Array)[0];

  const ranked = probs
    .map((p, i) => ({ type: labels.classes[i], p }))
    .sort((a, b) => b.p - a.p);
  const top = ranked[0];
  const freshnessReliable = !(labels.freshness_untrained_classes ?? []).includes(top.type);

  return {
    produce_type: top.type,
    // When the model was never trained on fresh/rotten examples of this type, its freshness
    // output is meaningless, so assume a typical fresh item (0.8) and flag it to the UI.
    quality_score: freshnessReliable ? Number(freshProb.toFixed(3)) : ASSUMED_QUALITY,
    confidence_score: Number(top.p.toFixed(3)),
    alternative_candidates: ranked.slice(1, 4).map(r => ({
      type: r.type,
      label: toLabel(r.type),
      reason: `Model probability ${(r.p * 100).toFixed(1)}%`,
    })),
    freshness_reliable: freshnessReliable,
    model: "BioFresh EfficientNet-B0 (Kaggle-trained, ONNX)",
  };
}
