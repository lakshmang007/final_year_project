/**
 * API Service for BioFresh-CV
 * 
 * This file talks to two main services:
 * 1. Google Gemini AI (Vision Model) - proxied securely via /api/predict
 * 2. Open-Meteo Weather API - to get local temperature, humidity, and moisture
 */

// Structure for alternative produce options (like if an avocado looks like a mango)
export interface AlternativeCandidate {
  type: string;
  label: string;
  reason?: string;
}

// Structure for what Gemini AI returns after looking at your photo
export interface PredictionResult {
  isInvalid?: boolean;
  is_produce?: boolean;
  is_human?: boolean;
  message?: string;
  details?: string;
  produce_type: string; // What produce it is (e.g. 'banana', 'avocado')
  quality_score: number; // Freshness score from 0.0 (rotten) to 1.0 (super fresh)
  confidence_score?: number; // How sure the AI is about its guess (0.0 to 1.0)
  alternative_candidates?: AlternativeCandidate[]; // Other fruits/veggies it might be
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
 * Takes a picture (in base64 format), sends it to our server-side /api/predict proxy,
 * which securely runs Google Gemini Multimodal AI to identify the fruit/vegetable, its freshness score,
 * and possible lookalikes.
 */
export async function predictProduce(imageBase64: string): Promise<PredictionResult> {
  try {
    const response = await fetch("/api/predict", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ imageBase64 })
    });

    if (!response.ok) {
      let errMsg = "AI produce analysis failed";
      try {
        const errJson = await response.json();
        if (errJson.message && errJson.details) {
          errMsg = `⚠️ ${errJson.message}: ${errJson.details}`;
        } else if (errJson.message) {
          errMsg = `⚠️ ${errJson.message}`;
        } else {
          errMsg = errJson.error || errMsg;
        }
      } catch {
        const text = await response.text();
        errMsg = text.substring(0, 150) || errMsg;
      }
      throw new Error(errMsg);
    }

    const data: PredictionResult = await response.json();
    return data;
  } catch (error: any) {
    console.error("Gemini Vision Prediction Error:", error);
    throw error;
  }
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
  const response = await fetch(url);
  if (!response.ok) throw new Error('Weather fetch failed');
  return response.json();
}
