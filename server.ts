import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

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

    // Optional reverse geocoding for city name
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
      // fallback to coordinates format
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

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
