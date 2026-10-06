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
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    // Weather is optional: fall back to standard room conditions so the scan still works
    console.warn('Weather fetch failed, using 20°C / 60% RH defaults:', err);
    return { temperature_celsius: 20, temperature_kelvin: 293.15, humidity_percent: 60, source: 'default' };
  }
}
