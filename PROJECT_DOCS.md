# BioFresh-CV: Technical Specification & Master Project Documentation

Welcome to the master technical specification and project documentation for **BioFresh-CV**. This document serves as the absolute source of truth for the project, detailing its conceptual foundation, scientific engines, current full-stack software architecture, state-of-the-art ML roadmap, and mobile integration specs.

---

## 1. Executive Summary

### 1.1 The Challenge
Global food waste is one of the most pressing environmental and economic challenges of our time. Over one-third of all food produced is lost or wasted, with fresh produce (fruits and vegetables) accounting for the highest share due to their highly perishable nature. Consumers struggle to visually estimate the remaining shelf life of produce, leading to premature disposal or unexpected spoilage. Furthermore, standard storage instructions fail to account for local environmental factors (temperature, humidity), which radically accelerate or decelerate biochemical degradation.

### 1.2 The Solution: BioFresh-CV
**BioFresh-CV** is an intelligent, full-stack, AI-powered fresh produce quality tracker and shelf-life prediction platform. By combining computer vision, real-time microclimate geolocational data, and rigorous thermodynamic chemical kinetics, BioFresh-CV does what no simple expiration tracker can: it dynamically predicts the **Remaining Useful Life (RUL)** of fresh produce and monitors active **Nutritional Decay** over time.

### 1.3 Key Value Propositions
*   **Computer Vision Classification**: Multimodal visual analysis to detect produce type and evaluate starting visual quality scores.
*   **Dynamic Thermodynamic Prediction**: Custom Arrhenius kinetic modeling that continuously scales decay rates based on real-time ambient temperature and humidity.
*   **Nutritional Decay Engine**: Tracks the real-time degradation of vitamins and antioxidants relative to the produce's physical deterioration.
*   **Zero-Waste Recipe Recommendations**: Proactively triggers recipe options when produce enters a "critical near-expiry" window (RUL < 24 hours).
*   **Cloud Persistence & Analytics**: Cross-device sync, household waste tracking, and historical logging powered by Firebase and Firestore.

---

## 2. Scientific & Mathematical Foundations

Unlike generic trackers that use fixed timers (e.g., "Bananas last 5 days"), BioFresh-CV runs a dynamic simulation of chemical kinetics using environmental data.

### 2.1 The Arrhenius Kinetic Engine
The degradation of physical structures, pigments, and nutritional compounds in fresh produce follows standard temperature-dependent chemical reactions. BioFresh-CV models these reaction kinetics using the **Arrhenius Equation**:

$$k = A \cdot e^{-\frac{E_a}{R \cdot T}}$$

Where:
*   $k$ = Specific decay rate constant ($\text{hours}^{-1}$)
*   $A$ = Pre-exponential frequency factor (frequency of collisions, unique to each produce category)
*   $E_a$ = Activation Energy ($\text{J/mol}$, representational of the barrier to degradation)
*   $R$ = Universal Gas Constant ($8.314 \text{ J/mol}\cdot\text{K}$)
*   $T$ = Ambient temperature in Kelvin ($\text{K} = \text{°C} + 273.15$)

#### Biochemical Calibration Parameters
The system calibrates its reaction kinetics using experimental biochemical thresholds:

| Produce Category | $A$ (Frequency Factor) | $E_a$ (Activation Energy in J/mol) | Baseline Lifespan (Avg Hours) | Key Decay Pathway |
| :--- | :--- | :--- | :--- | :--- |
| **Banana** | $2.0 \times 10^8$ | $60,000$ | $120$ | Ethylene autocatalysis, starch-to-sugar conversion |
| **Tomato** | $1.3 \times 10^8$ | $60,000$ | $168$ | Pectin-methylesterase cellular wall degradation |
| **Apple** | $0.6 \times 10^8$ | $60,000$ | $336$ | Cellular respiration, moisture loss, starch depletion |
| **Orange** | $1.0 \times 10^8$ | $60,000$ | $240$ | Organic acid combustion, mold susceptibility |
| **Lemon** | $1.0 \times 10^8$ | $60,000$ | $336$ | High citric acid buffering, slow visual skin decay |
| **Leafy Greens** | $4.6 \times 10^8$ | $60,000$ | $72$ | Chlorophyll photo-oxidation, extreme turgor loss |

### 2.2 Remaining Useful Life (RUL) Calculation
Once the initial visual quality score $Q_0 \in [0, 1.0]$ is assessed via Computer Vision, the remaining useful life in hours is computed as a linear/exponential degradation function relative to the kinetic decay rate $k$:

$$\text{RUL (Hours)} = \frac{Q_t}{k}$$

Where $Q_t$ represents the current quality offset. This means a banana stored in a warm, un-airconditioned room ($30^\circ\text{C}$ / $303.15\text{K}$) will have a decay rate $k$ significantly higher—and an RUL significantly lower—than one stored in a cellar ($15^\circ\text{C}$ / $288.15\text{K}$).

### 2.3 Non-Linear Nutritional Decay Model
Volatile vitamins (like Vitamin C and Folate) degrade much faster under heat and light than structural fibers or minerals. BioFresh-CV uses a **power-law sensitivity model** to predict nutrient retention:

$$\text{Nutrient Retention Factor} = (Q_t)^{\gamma}$$

Where $\gamma$ is the **Nutritional Sensitivity Coefficient**:
*   $\gamma > 1.0$: Highly Volatile (e.g., Vitamin C: $\gamma = 1.3$, Folate: $\gamma = 1.2$) — decays faster than visual appearance.
*   $\gamma \approx 1.0$: Direct Correlation (e.g., Vitamin B6, Thiamine: $\gamma = 1.1$) — tracks visual decay directly.
*   $\gamma < 1.0$: Highly Stable (e.g., Vitamin K: $\gamma = 0.7$, Potassium/Iron/Calcium: $\gamma = 0.3$) — remains highly retained even when the food is physically overripe.
*   $\gamma \approx 0.1$: Volumetrically Locked (e.g., Dietary Fiber: $\gamma = 0.1$) — remains unchanged until literal cellular rot.

---

## 3. Current Full-Stack Web Architecture

The active implementation of BioFresh-CV is built as an Express + Vite full-stack application configured for rapid containerized cloud environments.

```
+-------------------------------------------------------+
|                    React Frontend                     |
|  - UI Pages, Active Camera Capture, Google Maps API   |
+---------------------------+---------------------------+
                            |
                     (HTTPS API Proxy)
                            v
+-------------------------------------------------------+
|                    Express Backend                    |
|  - OpenWeather API Proxy, Vite Asset Serving          |
+---------------+---------------------------+-----------+
                |                           |
        (JSON Payloads)             (Google GenAI SDK)
                v                           v
+---------------+-----------+   +-----------+-----------+
|    Firebase Firestore     |   |    Google Gemini API  |
|  - Prediction DB & Auth   |   |  - Multimodal Vision  |
+---------------------------+   +-----------------------+
```

### 3.1 Directory Structure
The workspace is cleanly structured around modular concerns:
```
├── server.ts                    # Full-stack Node.js/Express server & weather API router
├── package.json                 # Project dependencies and deployment scripts
├── firestore.rules              # Firebase Security Rules for user-owned records
├── firebase-blueprint.json      # Firestore collection definitions
├── src/
│   ├── main.tsx                 # Frontend main entrypoint
│   ├── App.tsx                  # Core React Application & UI Orchestrator
│   ├── index.css                # Global Tailwind CSS & font bindings
│   ├── lib/
│   │   ├── firebase.ts          # Firebase SDK client initialization
│   │   ├── science.ts           # Arrhenius calculations & nutrient retention database
│   │   └── recipes.ts           # Recipe suggestions mapped to overripe conditions
│   └── services/
│       ├── api.ts               # Gemini model wrappers & weather fetchers
│       └── history.ts           # Firestore read/write interfaces & error logs
```

### 3.2 Key Service Integrations
1.  **Google Gemini AI Platform (`@google/genai` SDK)**: Uses `gemini-3-flash-preview` to parse real-time camera snapshots. It analyzes structural integrity, color, spotting, and wilting, returning a strictly formatted JSON specifying the identified `produce_type` and visual `quality_score`.
2.  **Keyless Location & Storage Environment Engine**: Allows users to enter any text address, city, or zip code, or click **"📍 Auto-detect Device Location"** via native browser GPS. Geocodes locations seamlessly using OpenStreetMap Nominatim without requiring any Google Maps API keys. Supports storage environment selection (Room Temp ~20°C, Outside Weather, or Refrigerator with custom temperature settings).
3.  **Open-Meteo Weather & Moisture API Engine (`/api/weather`)**: Real-time atmospheric and moisture telemetry integration using Open-Meteo's keyless weather endpoints. Ingests ambient `temperature_2m`, relative humidity (`relative_humidity_2m`), surface moisture, and shallow soil moisture (`soil_moisture_0_to_1cm`), while also supporting historical archive analysis via `archive-api.open-meteo.com`.
4.  **Firebase Firestore (`firebase/firestore`)**: Records individual histories, quality ratings, RUL timers, active geolocational metadata, and manual correction adjustments to the cloud database. Secured with user-isolated security rules (`request.auth.uid == resource.data.userId`).

---

## 4. Architectural Differentiators & ML Roadmap

The core system is prepared to support significant advancements, positioning BioFresh-CV as an industry-leading agricultural-tech and zero-waste utility.

### 4.1 Computer Vision (CV) Enhancements
*   **Ripeness Stage Classification (CNN)**: Implement localized Convolutional Neural Networks to classify visual produce into discrete physiological stages (e.g., Green, Yellow-green, Yellow, Senescent Brown for bananas) to establish highly precise visual baselines.
*   **Decay & Mold Detection**: Train lightweight Object Detection architectures (such as YOLOv8) to draw boundary boxes around lesions, bruises, or fungal mycelium, applying mathematical penalties to the visual score based on surface area coverage.
*   **Visual Quality Scoring**: Use Deep Regression networks trained on standardized agricultural maturity indices to automate high-accuracy quality score outputs.

### 4.2 Predictive Time-Series ML
*   **LSTM & GRU Networks**: Long Short-Term Memory (LSTM) networks can ingest historical environmental streams (time-series temperature/humidity records of a kitchen) to predict future room conditions and adaptively adjust the degradation rate curve.
*   **Multi-Factor Degradation Modeling**: Expand standard Arrhenius equations to support dynamic coefficients representing ethylene exposure, air velocity, and direct sunlight indicators.

### 4.3 Supply Chain Integration
*   **Provenance & Batch Tracking**: Establish standardized JSON-LD structures to represent batch origin, harvest dates, and transit logs.
*   **Supplier Quality Scoring**: Map historical spoilage rates to identify which regional farms or grocery stores consistently supply produce with the longest remaining useful lives.
*   **Redistribution Optimization**: Algorithms designed to flag soon-to-expire produce batches and recommend optimized routing to local food banks or composting facilities.

### 4.4 Personalization Engine
*   **Household Behavior Modeling**: Track how quickly a specific household consumes certain produce types. If the system observes that a household consumes bananas within 48 hours, it can lower decay warning priority.
*   **Waste Tracker Scorecard**: Visualize financial and carbon savings over time, creating a gamified "Zero-Waste" dashboard to display overall household efficiency.

### 4.5 Explainable AI (XAI)
*   **SHAP & LIME Interpretability**: Offer users detailed breakdowns of why their food is degrading quickly (e.g., *"Our models show that high ambient humidity [78%] contributed 42% to this rapid decay rate. Moving this item to a dry cabinet will extend RUL by 36 hours"*).

### 4.6 Multimodal Learning & Graph Networks
*   **Ethylene Gas GNNs (Graph Neural Networks)**: Model physical kitchen storage layout as a node-edge graph. Since bananas emit high concentrations of ethylene gas, a GNN can predict the accelerated decay rate of neighboring items (e.g., apples, avocados) stored in the same physical fruit bowl.

---

## 5. Mobile Native Integration Specifications (Flutter Roadmap)

For production deployment, BioFresh-CV is designed to scale into a high-performance cross-platform mobile application using **Flutter**.

```
+-------------------------------------------------------------+
|                     Flutter Mobile App                      |
|                                                             |
|   +-----------------------+     +-----------------------+   |
|   |   UI (Dart/Flutter)   | <-> |  Local SQLite/Isar    |   |
|   +-----------+-----------+     +-----------+-----------+   |
|               |                             |               |
|       (Platform Channels)           (Offline Cache)         |
|               v                             v               |
|   +-----------------------+     +-----------------------+   |
|   |  TensorFlow Lite      |     |  Cloud Sync Gateway   |   |
|   |  On-Device CV Model   |     |  (Firebase Firestore) |   |
|   +-----------+-----------+     +-----------+-----------+   |
+---------------|-----------------------------|---------------+
                v                             v
        (Camera Stream)              (Remote Firestore)
```

### 5.1 Why Flutter?
*   **Native Camera Performance**: Direct, hardware-accelerated camera buffer integration via the Dart `camera` library, allowing real-time processing.
*   **On-Device Hardware Ingress**: Direct access to local neural processors (NPUs) on modern iOS and Android chipsets via platform channels.
*   **Consistent Graphic Rendering**: Custom Canvas-level graphics rendering (Impeller engine) ensures complex decay widgets and charts render smoothly at a locked 120Hz.

### 5.2 Lightweight On-Device Inference (TFLite & ML Kit)
To operate without an internet connection (e.g., while inside a basement grocery aisle or a deep pantry), the system uses edge computing:
1.  **TensorFlow Lite (TFLite) Integration**:
    *   Compress the pre-trained classification models into quantized `.tflite` flatbuffers (e.g., MobileNetV3 or EfficientNet-Lite optimized to under 5MB).
    *   Incorporate `flutter_tflite` to run local classification on the device's CPU/GPU with zero latency.
2.  **Google ML Kit Integration**:
    *   Use ML Kit's generic Object Detection API to locate fresh produce within the active viewfinder.
    *   Crop the region of interest (ROI) instantly and pass it directly to the local TFLite model, maximizing prediction confidence and reducing ambient noise.

### 5.3 Offline-First Sync with Firebase
1.  **Local SQLite/Isar Cache**: Mobile sessions are written locally to a high-speed transactional database.
2.  **Firestore Auto-Synchronization**: When network connectivity is established, Firestore's built-in offline synchronization mechanics automatically upload pending queue entries and pull down updated global environmental tables.

---

## 6. Project Setup & Deployment Guide

To run or build the complete full-stack web environment:

### 6.1 Prerequisites
*   Node.js v18 or higher
*   Firebase CLI installed (`npm install -g firebase-tools`)
*   A valid **Google Gemini API Key**
*   (Optional) An **OpenWeather API Key** for live meteorological synchronization

### 6.2 Environment Configuration
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
OPENWEATHER_API_KEY=your_openweather_api_key_here
```

### 6.3 Local Installation & Launch
1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Launch the combined full-stack developer server:
    ```bash
    npm run dev
    ```
3.  Access the interface by visiting `http://localhost:3000` in your browser.

### 6.4 Production Build
1.  Compile static assets and package server files:
    ```bash
    npm run build
    ```
2.  Launch the compiled node package:
    ```bash
    npm run start
    ```

---

## 7. Complete Summary Points of the BioFresh-CV Project

To provide a quick, high-level digest of the entire lifecycle and accomplishments of the BioFresh-CV initiative, here are the **10 core summary points**:

1.  **Clear Environmental Mission**: Solves consumer food waste by substituting generic shelf-life rules with a scientifically accurate, real-time expiration tracker.
2.  **Multimodal Computer Vision**: Integrates Google's advanced Gemini AI to instantly identify produce types and accurately rate their starting visual freshness from live images.
3.  **Strict Biochemical Modeling**: Developed a custom thermodynamic engine that applies the classical **Arrhenius Equation** to continuously adapt deterioration rates to real-world environments.
4.  **Weather-Informed Prediction**: Connects with global weather stations to automatically inject localized microclimate temperature and humidity data into the decay engine.
5.  **Interactive Geolocation Map**: Equipped with an elegant, responsive Google Maps interface with automatic GPS coordinates finder and human-readable address lookups.
6.  **Nutritional Tracking Engine**: Features a non-linear power-law decay model that monitors nutrient and vitamin depletion relative to physical ripening.
7.  **Smart Proactive Recipes**: Recommends customized, zero-waste recipes (like Banana Bread or Vegetable Stock) only when produce falls below critical shelf-life thresholds (RUL < 24 hrs).
8.  **Secure Multi-User Database**: Backed by Firebase Authentication and custom Firestore schemas ensuring user-owned historical preservation and fast dashboard rendering.
9.  **Cutting-Edge ML Roadmap**: Outlined comprehensive expansion strategies incorporating GNNs for ethylene tracking, LSTM models for room climate forecasting, and SHAP interpretability.
10. **Native Mobile Strategy**: Designed a fully specified, high-performance Flutter mobile application spec optimized for local TensorFlow Lite and Google ML Kit on-device inference.

---

*Document compiled and approved by the BioFresh-CV Core AI Engineering Team.*
