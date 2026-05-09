/**
 * API Service for BioFresh-CV
 */
import { GoogleGenAI } from "@google/genai";

export interface PredictionResult {
  produce_type: string;
  quality_score: number;
}

export interface WeatherData {
  temperature_kelvin: number;
  humidity_percent: number;
  source: string;
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function predictProduce(imageBase64: string): Promise<PredictionResult> {
  try {
    // Clean base64 string
    const base64Data = imageBase64.split(",")[1] || imageBase64;

    const imagePart = {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64Data,
      },
    };
    
    const textPart = {
      text: `Analyze this image of fresh produce with extreme biochemical precision.
      1. Identify the specific type of produce. Pay intense attention to citrus differentiation:
         - Orange: Typically spherical, saturated ORANGE skin, larger diameter (6-9cm), distinct textured "pith" skin.
         - Lemon: Typically ellipsoidal/oval, bright YELLOW skin, smaller (5-7cm), often has a distinct "nipple" at one or both ends.
         - Banana: Curved, yellow (or green), look for senescence spotting (brown dots).
         - Tomato: Smooth red skin, spherical.
         - Leafy Greens: Identify spinach, kale, or simple lettuce.
      2. If multiple items are present, identify the most central or prominent one.
      3. Assign a quality score from 0.0 (rotten/severely decayed) to 1.0 (peak freshness/perfect). 
         - A quality score of 1.0 means it was likely harvested within 24-48 hours.
         - Deduct points for soft spots, bruising, wilting, mold, or discoloration.
      Return ONLY a JSON object: {"produce_type": "string", "quality_score": float}. Use lowercase snake_case for produce_type.`,
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini");
    
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Gemini Frontend Error:", error);
    throw error;
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
  if (!response.ok) throw new Error('Weather fetch failed');
  return response.json();
}
