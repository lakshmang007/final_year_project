/**
 * Backend Web Server (Node.js + Express + Vite)
 * 
 * In simple words:
 * This server runs behind the scenes to:
 * 1. Serve the frontend React website.
 * 2. Fetch live weather & moisture telemetry for the user's location via Open-Meteo.
 * 3. Reverse-geocode coordinates into readable city names using OpenStreetMap Nominatim.
 * 4. Run our own Kaggle-trained produce freshness model (/api/predict).
 * 5. Save user feedback so similar photos are recognised next time (/api/feedback).
 * 6. Generative AI rescue plans and the agentic Kitchen Rescue Agent (/api/genai, /api/agent).
 */
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { predictImage, modelAvailable, recordFeedback } from "./src/server/produceModel";
import { feedbackStats } from "./src/server/feedbackStore";
import { generateRescuePlan, runKitchenAgent, llmStatus } from "./src/ai_engines";
import type { InventoryItem } from "./src/ai_engines/tools";

// Load environment variables from .env file
dotenv.config();

const app = express();
// Behind Render's proxy: use the visitor's real IP (X-Forwarded-For) for rate limiting
app.set("trust proxy", 1);
const PORT = Number(process.env.PORT) || 3000;

// Allow accepting large image payloads (up to 10 megabytes)
app.use(express.json({ limit: '10mb' }));

/**
 * Health check endpoint - used to verify the backend server is running smoothly
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * GET /api/weather
 * 
 * Fetches real-time ambient weather (temperature in Celsius and Kelvin, humidity, soil moisture)
 * based on the provided latitude and longitude.
 */
app.get("/api/weather", async (req, res) => {
  try {
    const { lat, lon, start_date, end_date } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({ error: "Missing latitude or longitude parameters" });
    }
    const latNum = Number(lat), lonNum = Number(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || Math.abs(latNum) > 90 || Math.abs(lonNum) > 180) {
      return res.status(400).json({ error: "Latitude must be -90..90 and longitude -180..180" });
    }

    // 1. Check if historical archive query is requested
    if (start_date && end_date) {
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start_date}&end_date=${end_date}&hourly=temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm`;
      const archiveRes = await fetch(archiveUrl);
      const archiveData = await archiveRes.json();
      if (!archiveRes.ok) {
        return res.status(502).json({ error: `Open-Meteo archive HTTP ${archiveRes.status}: ${archiveData.reason || ""}` });
      }

      return res.json({
        type: "archive",
        source: "open-meteo-archive",
        latitude: archiveData.latitude,
        longitude: archiveData.longitude,
        hourly: archiveData.hourly
      });
    }

    // 2. Real-time forecast & moisture content query via Open-Meteo
    const openMeteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm`;
    let current: any = null;
    let weatherError = "";
    try {
      const openMeteoRes = await fetch(openMeteoUrl);
      const openMeteoData = await openMeteoRes.json().catch(() => ({}));
      current = openMeteoRes.ok ? openMeteoData.current : null;
      // Shared hosting IPs (e.g. Render's free plan) are often rate-limited by Open-Meteo
      if (!current) weatherError = `Open-Meteo HTTP ${openMeteoRes.status}: ${openMeteoData.reason || "no current data"}`;
    } catch (e: any) {
      weatherError = `Open-Meteo unreachable: ${e.message}`;
    }

    // Optional reverse geocoding to find city / neighborhood name
    let locationName = `Lat: ${Number(lat).toFixed(2)}, Lon: ${Number(lon).toFixed(2)}`;
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`, {
        headers: { 'User-Agent': 'BioFresh-CV/1.0' }
      });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        if (geoData.address) {
          locationName = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.county || locationName;
        }
      }
    } catch {
      // If geocoding fails, fallback gracefully to coordinate string
    }

    if (!current) {
      // Don't invent numbers: tell the client, which then asks Open-Meteo directly from the browser
      console.warn("Weather unavailable on server:", weatherError);
      return res.status(502).json({ error: weatherError, location_name: locationName });
    }
    const tempCelsius = current.temperature_2m;
    const humidityPercent = current.relative_humidity_2m;
    const soilMoisture = current.soil_moisture_0_to_1cm ?? null;

    res.json({
      temperature_celsius: tempCelsius,
      temperature_kelvin: tempCelsius + 273.15,
      humidity_percent: humidityPercent,
      moisture_content: humidityPercent, // relative humidity / moisture content %
      soil_moisture: soilMoisture,
      location_name: locationName,
      source: 'open-meteo'
    });
  } catch (error: any) {
    console.error("Weather API error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/predict
 *
 * Body: { image: "<base64 or data URL>" }
 * Runs the locally trained produce model (models/produce_model.onnx) and returns
 * produce type, freshness-based quality score, confidence and alternatives.
 */
app.post("/api/predict", async (req, res) => {
  try {
    const { image } = req.body || {};
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Missing image in request body" });
    }
    res.json(await predictImage(image));
  } catch (error: any) {
    console.error("Prediction error:", error);
    const status = modelAvailable() ? 500 : 503;
    res.status(status).json({ error: error.message || "Prediction failed" });
  }
});

/**
 * POST /api/feedback
 *
 * Body: { image, predicted, correct: boolean, label?, is_produce? }
 * Saves the user's answer to "Is this correct?". If not correct, `label` is what the item
 * really is (any text). Similar photos are then recognised with that label, and the images
 * are used the next time the model is retrained (ml/train.py).
 */
app.post("/api/feedback", async (req, res) => {
  try {
    const { image, predicted, correct, label, is_produce } = req.body || {};
    if (!image || typeof image !== "string" || typeof predicted !== "string" || typeof correct !== "boolean") {
      return res.status(400).json({ error: "Expected { image, predicted, correct, label? }" });
    }
    const finalLabel = correct ? predicted : String(label || "").trim();
    if (!finalLabel) {
      return res.status(400).json({ error: "Please enter what the item is" });
    }
    // is_produce: whether the label is a fruit/vegetable ("human" is not); defaults from the label
    const labelIsProduce = typeof is_produce === "boolean" ? is_produce : finalLabel !== "not_produce";
    res.json(await recordFeedback(image, predicted, finalLabel, correct, labelIsProduce));
  } catch (error: any) {
    console.error("Feedback error:", error);
    res.status(500).json({ error: error.message || "Could not save feedback" });
  }
});

app.get("/api/feedback/stats", (req, res) => {
  res.json(feedbackStats());
});

/**
 * GET /api/model/info
 *
 * Returns the trained model's classes and held-out test metrics (models/metrics.json).
 */
app.get("/api/model/info", (req, res) => {
  const read = (f: string) => {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "models", f), "utf8")); } catch { return null; }
  };
  res.json({ available: modelAvailable(), labels: read("labels.json"), metrics: read("metrics.json") });
});

/**
 * Simple per-IP rate limit for the AI endpoints (each call uses Gemini quota).
 */
const aiHits = new Map<string, number[]>();
function aiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const recent = (aiHits.get(key) || []).filter(t => now - t < 60_000);
  if (recent.length >= 10) {
    return res.status(429).json({ error: "Too many AI requests. Please wait a minute and try again." });
  }
  recent.push(now);
  aiHits.set(key, recent);
  next();
}

/**
 * GET /api/ai/status - whether Gemini is configured (otherwise the AI features run in offline mode)
 */
app.get("/api/ai/status", async (req, res) => {
  res.json(await llmStatus());
});

/**
 * POST /api/genai/rescue-plan
 * Body: { produce_type, quality_score, rul_hours, temperature_c?, humidity_percent?, storage?, freshness_reliable? }
 * Generative AI: Gemini writes recipes + storage + zero-waste tips grounded in the knowledge base (RAG).
 */
app.post("/api/genai/rescue-plan", aiRateLimit, async (req, res) => {
  try {
    const b = req.body || {};
    if (typeof b.produce_type !== "string" || typeof b.quality_score !== "number" || typeof b.rul_hours !== "number") {
      return res.status(400).json({ error: "Expected { produce_type, quality_score, rul_hours }" });
    }
    res.json(await generateRescuePlan({
      produce_type: b.produce_type.slice(0, 40),
      quality_score: Math.min(1, Math.max(0, b.quality_score)),
      rul_hours: Math.max(0, b.rul_hours),
      temperature_c: typeof b.temperature_c === "number" ? b.temperature_c : undefined,
      humidity_percent: typeof b.humidity_percent === "number" ? b.humidity_percent : undefined,
      storage: typeof b.storage === "string" ? b.storage.slice(0, 20) : undefined,
      freshness_reliable: b.freshness_reliable !== false,
    }));
  } catch (error: any) {
    console.error("GenAI error:", error);
    res.status(502).json({ error: "The AI could not generate a plan right now: " + (error.message || "unknown error").slice(0, 300) });
  }
});

/**
 * POST /api/agent/run
 * Body: { goal, inventory: [{ id, produceType, qualityScore, rulHours, timestamp, alertEnabled }], weather? }
 * Agentic AI: the Kitchen Rescue Agent calls tools in a loop and returns its answer, every step, and actions.
 */
app.post("/api/agent/run", aiRateLimit, async (req, res) => {
  try {
    const { goal, inventory, weather } = req.body || {};
    if (typeof goal !== "string" || !goal.trim() || !Array.isArray(inventory)) {
      return res.status(400).json({ error: "Expected { goal, inventory[] }" });
    }
    const items: InventoryItem[] = inventory.slice(0, 50)
      .filter((i: any) => i && typeof i.id === "string" && typeof i.produceType === "string" && typeof i.rulHours === "number")
      .map((i: any) => ({
        id: i.id.slice(0, 64), produceType: i.produceType.slice(0, 40),
        qualityScore: Math.min(1, Math.max(0, Number(i.qualityScore) || 0)), rulHours: Math.max(0, i.rulHours),
        timestamp: String(i.timestamp || new Date().toISOString()), alertEnabled: !!i.alertEnabled,
      }));
    const w = weather && typeof weather === "object" ? {
      temperature_celsius: Number(weather.temperature_celsius) || undefined,
      humidity_percent: Number(weather.humidity_percent) || undefined,
      location_name: typeof weather.location_name === "string" ? weather.location_name.slice(0, 60) : undefined,
    } : null;
    res.json(await runKitchenAgent(goal.trim().slice(0, 500), { inventory: items, weather: w, actions: [] }));
  } catch (error: any) {
    console.error("Agent error:", error);
    res.status(502).json({ error: "The agent could not finish right now: " + (error.message || "unknown error").slice(0, 300) });
  }
});

/**
 * JSON error handler: malformed JSON or a too-large upload returns a JSON error
 * (instead of Express's default HTML error page) so the app can show the message.
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.path.startsWith("/api/")) return next(err);
  const status = err.status || err.statusCode || 500;
  const message = err.type === "entity.too.large"
    ? "Image is too large (max 10 MB). Please use a smaller photo."
    : status === 400 ? "Invalid request body" : "Server error";
  res.status(status).json({ error: message });
});

/**
 * startServer
 * 
 * Boots up the Express web server and attaches Vite development middleware.
 */
async function startServer() {
  // `npm start` passes --production (works the same on Windows and Linux hosts like Render)
  const isProduction = process.env.NODE_ENV === "production" || process.argv.includes("--production");
  if (!isProduction) {
    // In development: Vite handles live bundling
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production: serve static built HTML/JS files from the dist folder
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to port 3000 on host 0.0.0.0
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
