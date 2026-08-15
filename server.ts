/**
 * Backend Web Server (Node.js + Express + Vite)
 * 
 * In simple words:
 * This server runs behind the scenes to:
 * 1. Serve the frontend React website.
 * 2. Fetch live weather & moisture telemetry for the user's location via Open-Meteo.
 * 3. Reverse-geocode coordinates into readable city names using OpenStreetMap Nominatim.
 */
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = 3000;

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

    // 1. Check if historical archive query is requested
    if (start_date && end_date) {
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start_date}&end_date=${end_date}&hourly=temperature_2m,relative_humidity_2m,soil_moisture_0_to_1cm`;
      const archiveRes = await fetch(archiveUrl);
      const archiveData = await archiveRes.json();

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
    const openMeteoRes = await fetch(openMeteoUrl);
    const openMeteoData = await openMeteoRes.json();

    const tempCelsius = openMeteoData.current?.temperature_2m ?? 25;
    const humidityPercent = openMeteoData.current?.relative_humidity_2m ?? 60;
    const soilMoisture = openMeteoData.current?.soil_moisture_0_to_1cm ?? null;

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
 * startServer
 * 
 * Boots up the Express web server and attaches Vite development middleware.
 */
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
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
