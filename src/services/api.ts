/**
 * API Service for BioFresh-CV
 * 
 * This file talks to two main services:
 * 1. Google Gemini AI (Vision Model) - to see and identify the produce in your picture
 * 2. Open-Meteo Weather API - to get local temperature, humidity, and moisture
 */
import { GoogleGenAI } from "@google/genai";

// Structure for alternative produce options (like if an avocado looks like a mango)
export interface AlternativeCandidate {
  type: string;
  label: string;
  reason?: string;
}

// Structure for what Gemini AI returns after looking at your photo
export interface PredictionResult {
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

// Connect to the Google Gemini AI library using your API key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * predictProduce
 * 
 * Takes a picture (in base64 format), sends it to Gemini AI,
 * and asks the AI to identify the fruit/vegetable, its freshness score,
 * and possible lookalikes.
 */
export async function predictProduce(imageBase64: string): Promise<PredictionResult> {
  try {
    // Clean up the base64 image data string (removes the 'data:image/jpeg;base64,' prefix if present)
    const base64Data = imageBase64.split(",")[1] || imageBase64;

    // Wrap the image into the format Gemini AI expects
    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data,
      },
    };
    
    // Clear prompt instructing the AI on what to detect and how to format the answer
    const textPart = {
      text: `Analyze this image of fresh produce with extreme biochemical precision.
      1. Identify the specific primary produce item. Pay intense attention to key distinctions:
         - Avocado: Dark green or black/purple pebbled/bumpy skin (Hass) or glossy bright green pear-shape (Fuerte). Pear/oval shape with distinct stem end.
         - Mango: Smooth, glossy skin with a green, red, orange, or yellow blush. Oblong or kidney shape. Smooth texture without dark pebbled bumps.
         - Banana: Curved, elongated, yellow or green skin with longitudinal ridges or spots.
         - Tomato: Smooth red, yellow, or green skin, spherical, green calyx/stem star at top.
         - Apple: Round, firm, shiny red/green/yellow skin with indented stem cavity.
         - Orange: Spherical, bright orange, textured porous citrus peel.
         - Lemon: Ellipsoidal/oval, bright yellow skin, distinct nipple tips.
         - Leafy Greens: Spinach, kale, lettuce leaves.
         - Papaya / Lime / Cucumber / Bell Pepper.
      2. Produce items can look visually ambiguous (e.g., an dark avocado vs. a green/blushed mango, or a green apple vs. tomato).
         Provide up to 3 visually similar alternative candidates in 'alternative_candidates' that this item might also be if it was misidentified.
      3. Assign a quality score from 0.0 (rotten) to 1.0 (peak freshness).
      4. Assign a confidence_score between 0.0 and 1.0 for your top identification.

      Return ONLY a JSON object:
      {
        "produce_type": "string (lowercase snake_case)",
        "quality_score": float,
        "confidence_score": float,
        "alternative_candidates": [
          {"type": "avocado", "label": "Avocado", "reason": "Dark or green oval shape with pebbled skin"},
          {"type": "mango", "label": "Mango", "reason": "Smooth oblong tropical fruit"}
        ]
      }`,
    };

    // Ask Gemini AI to generate the analysis
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json" // Asks Gemini to return pure JSON
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");
    
    // Parse the JSON string into our PredictionResult object
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Frontend Error:", error);
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
