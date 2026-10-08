/**
 * ==========================================
 * PREDICTIVE AI - what BioFresh actually runs for every scan
 * ==========================================
 *
 * 1. COMPUTER VISION (deep learning, trained by ml/train.py):
 *    EfficientNet-B0 fine-tuned on Kaggle datasets, exported to ONNX (models/produce_model.onnx)
 *    and run on the server with onnxruntime-node (src/server/produceModel.ts).
 *    Outputs: produce type (34 types + "not_produce"), probability the item is fresh, and an
 *    image embedding used to match user feedback.
 *
 * 2. SHELF-LIFE PREDICTION (physics model, src/lib/science.ts):
 *    Arrhenius kinetics k = A * exp(-Ea / (R*T)), Remaining Useful Life = quality / k hours,
 *    where quality comes from step 1 and T is the storage temperature.
 *
 * This file only re-exports those two pieces so the AI parts of the project are easy to find.
 */
export { predictImage } from "../server/produceModel";
export { calculateDecayRate, calculateRUL, getNutrientRetention } from "../lib/science";
