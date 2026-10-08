/**
 * API Service for BioFresh-CV
 * 
 * This file talks to two main services:
 * 1. Our backend's trained produce model - to identify the produce and its freshness
 * 2. Open-Meteo Weather API - to get local temperature, humidity, and moisture
 */

// Structure for alternative produce options (like if an avocado looks like a mango)
export interface AlternativeCandidate {
  type: string;
  label: string;
  reason?: string;
}

// Structure for what the produce model returns after looking at your photo
export interface PredictionResult {
  produce_type: string; // What produce it is (e.g. 'banana', 'avocado')
  quality_score: number; // Freshness score from 0.0 (rotten) to 1.0 (super fresh)
  confidence_score?: number; // How sure the AI is about its guess (0.0 to 1.0)
  alternative_candidates?: AlternativeCandidate[]; // Other fruits/veggies it might be
  model?: string; // Which model produced the prediction
  freshness_reliable?: boolean; // False if the model had no fresh/rotten training data for this type
  is_produce?: boolean; // False when the photo is not a fruit/vegetable (e.g. a person)
  low_confidence?: boolean; // True when the model's best guess is under 50% sure
  source?: 'model' | 'feedback'; // 'feedback' = recognised from an earlier user correction
  matched_feedback?: { label: string; similarity: number } | null;
}

// Structure for current temperature and moisture readings
export interface WeatherData {
  temperature_celsius?: number;
  temperature_kelvin: number; // Needed for science math (Arrhenius equations)
  humidity_percent: number;
  moisture_content?: number;
  soil_moisture?: number | null;
  location_name?: string;
  source: string;
}

// Structure for historical weather data archive if needed
export interface ArchiveWeatherData {
  type: string;
  source: string;
  latitude: number;
  longitude: number;
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m?: number[];
    soil_moisture_0_to_1cm?: number[];
  };
}

/**
 * predictProduce
 *
 * Sends the picture (base64) to our backend (/api/predict), which runs the
 * locally trained EfficientNet-B0 model (trained on Kaggle fresh/rotten produce
 * datasets, see ml/train.py). Returns the produce type, a freshness-based
 * quality score, confidence and look-alike alternatives.
 */
export async function predictProduce(imageBase64: string): Promise<PredictionResult> {
  const response = await fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Prediction failed (HTTP ${response.status})`);
  }
  return body as PredictionResult;
}

/**
 * sendFeedback
 *
 * Answers "Is this correct?" for a scan. When `correct` is false, `label` is what the item
 * really is (any name). The server remembers it so similar photos are recognised next time.
 */
export async function sendFeedback(image: string, predicted: string, correct: boolean, label: string | undefined, isProduce: boolean): Promise<{ label: string; stats: { total: number } }> {
  const response = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, predicted, correct, label, is_produce: isProduce }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Saving feedback failed (HTTP ${response.status})`);
  return body;
}

// Standard room conditions, used when the location or the weather service is unavailable
export const DEFAULT_WEATHER: WeatherData = { temperature_celsius: 20, temperature_kelvin: 293.15, humidity_percent: 60, source: 'default' };

/**
 * fetchWeather
 * 
 * Calls our local Express backend endpoint (/api/weather)
 * which fetches real-time temperature, humidity, and location name
 * based on GPS coordinates (latitude and longitude).
 */
export async function fetchWeather(lat: number, lon: number, startDate?: string, endDate?: string): Promise<WeatherData> {
  let url = `/api/weather?lat=${lat}&lon=${lon}`;
  if (startDate && endDate) {
    url += `&start_date=${startDate}&end_date=${endDate}`;
  }
  let locationName: string | undefined;
  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));
    if (response.ok) return body;
    locationName = body.location_name; // the server still knows the city name
    console.warn('Server weather unavailable, asking Open-Meteo directly:', body.error || response.status);
  } catch (err) {
    console.warn('Server weather request failed, asking Open-Meteo directly:', err);
  }

  // Fallback: ask Open-Meteo straight from the browser (uses the visitor's own connection,
  // so it isn't affected by rate limits on the hosting server's shared IP)
  if (!startDate) {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm`);
      const c = r.ok ? (await r.json()).current : null;
      if (c && typeof c.temperature_2m === 'number') {
        return {
          temperature_celsius: c.temperature_2m,
          temperature_kelvin: c.temperature_2m + 273.15,
          humidity_percent: c.relative_humidity_2m,
          moisture_content: c.relative_humidity_2m,
          soil_moisture: c.soil_moisture_0_to_1cm ?? null,
          location_name: locationName,
          source: 'open-meteo (browser)',
        };
      }
    } catch (err) {
      console.warn('Direct Open-Meteo request failed:', err);
    }
  }

  // Weather is optional: fall back to standard room conditions so the scan still works
  console.warn('Weather unavailable, using 20°C / 60% RH defaults');
  return { ...DEFAULT_WEATHER, location_name: locationName };
}

// ---------------------------------------------------------------------------
// Generative AI + Agentic AI (served by src/ai_engines on the server; the API key never reaches the browser)
// ---------------------------------------------------------------------------

export interface AIStatus { available: boolean; provider: string; model: string | null; reason: string | null }

export interface RescuePlanResult {
  mode: 'llm' | 'offline';
  model: string | null;
  plan: {
    headline: string;
    urgency: 'low' | 'medium' | 'high';
    safe_to_eat: boolean;
    recipes: { name: string; why: string; minutes: number; ingredients: string[]; steps: string[] }[];
    storage_tips: string[];
    waste_tip: string;
  };
  sources: { id: string; title: string; category: string }[];
}

export interface AgentRunResult {
  mode: 'llm' | 'offline';
  model: string | null;
  answer: string;
  steps: { tool: string; args: Record<string, unknown>; result: unknown; thought?: string }[];
  actions: { type: 'set_reminder'; item_id: string; produce: string; hours_before_expiry: number }[];
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status})`);
  return data as T;
}

export async function getAIStatus(): Promise<AIStatus> {
  const r = await fetch('/api/ai/status');
  return r.json();
}

export function generateRescuePlan(facts: {
  produce_type: string; quality_score: number; rul_hours: number;
  temperature_c?: number; humidity_percent?: number; storage?: string; freshness_reliable?: boolean;
}): Promise<RescuePlanResult> {
  return postJson('/api/genai/rescue-plan', facts);
}

export function runKitchenAgent(goal: string, inventory: {
  id: string; produceType: string; qualityScore: number; rulHours: number; timestamp: string; alertEnabled?: boolean;
}[], weather?: { temperature_celsius?: number; humidity_percent?: number; location_name?: string } | null): Promise<AgentRunResult> {
  return postJson('/api/agent/run', { goal, inventory, weather });
}

export interface ModelInfo {
  available: boolean;
  labels: { classes: string[]; freshness_untrained_classes?: string[]; model_version?: string } | null;
  metrics: {
    test_type_accuracy?: number; test_freshness_accuracy?: number; test_real_world_type_accuracy?: number | null;
    train_images?: number; datasets?: Record<string, number>; trained_at?: string;
    independent_eval?: { produce_top1: number; produce_top3: number; not_produce_rejected: number; images: number; produce_images: number; not_produce_images: number; source: string } | null;
  } | null;
}

export async function getModelInfo(): Promise<ModelInfo> {
  const r = await fetch('/api/model/info');
  return r.json();
}
