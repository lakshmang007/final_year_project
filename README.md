# BioFresh-CV

Photo-based produce freshness and shelf-life prediction. A model trained on public Kaggle
datasets identifies the produce and whether it is fresh or rotten. An Arrhenius kinetics
engine then turns that freshness score, plus the storage temperature, into the Remaining
Useful Life (RUL), nutrient retention and zero-waste recipe suggestions.

No AI API key is needed. All image predictions run on the local trained model.

## How it works

```
Camera / upload ──► POST /api/predict (server.ts)
                       │  sharp: decode + resize 224×224
                       ▼
             models/produce_model.onnx  (EfficientNet-B0, onnxruntime-node)
                       │  type softmax  +  freshness sigmoid
                       ▼
        produce_type, quality_score (= P(fresh)), confidence, alternatives
                       │
Open-Meteo weather ───►│  src/lib/science.ts: k = A·e^(−Ea/RT),  RUL = Q / k
                       ▼
           RUL hours · nutrient retention · recipes · Firestore history
```

## The trained model

| | |
|---|---|
| Architecture | EfficientNet-B0 (ImageNet pre-trained), two heads: type (34 produce classes + `not_produce`) and fresh vs rotten, plus an image embedding output |
| Training script | [`ml/train.py`](ml/train.py) |
| Output | `models/produce_model.onnx`, `models/labels.json`, `models/metrics.json` (held-out test accuracy) |
| Classes | apple, avocado, banana, beetroot, bell_pepper, cabbage, carrot, cauliflower, chilli_pepper, corn, cucumber, eggplant, garlic, ginger, grapes, kiwi, leafy_greens (lettuce, spinach), lemon, lime, mango, onion, orange, papaya, pear, peas, pineapple, pomegranate, potato, radish, strawberry, sweet_potato, tomato, turnip, watermelon, **not_produce** |
| Inference | Each photo is analysed as 3 views (whole photo, central 80% crop, mirrored) and the predictions are averaged |

**Datasets** (downloaded automatically, no Kaggle login needed):

1. [Fruits and Vegetables Dataset](https://www.kaggle.com/datasets/muhriddinmuxiddinov/fruits-and-vegetables-dataset): 12,000 images, 10 types, fresh and rotten
2. [Fruits fresh and rotten for classification](https://www.kaggle.com/datasets/sriramr/fruits-fresh-and-rotten-for-classification): apple, banana and orange, fresh and rotten. The duplicated folders are removed, and each group is capped at 1,500 images for class balance.
3. [Fruits-360](https://www.kaggle.com/datasets/moltean/fruits): studio photos, type labels only. It adds avocado, lemon, lime, papaya and studio shots of the other types.
3b. [Fruit and Vegetable Image Recognition](https://www.kaggle.com/datasets/kritikseth/fruit-and-vegetable-image-recognition): about 3,200 **real-world web photos** of 36 types, with varied backgrounds and lighting. They count 3× in training, and accuracy on its held-out photos is reported separately as `test_real_world_type_accuracy`.
4. [Natural Images](https://www.kaggle.com/datasets/prasunroy/natural-images) (people, cats, dogs, cars, airplanes, flowers, motorbikes; its fruit folder is excluded) and [LFW faces](https://www.kaggle.com/datasets/jessicali9530/lfw-dataset): the `not_produce` class, so photos of people or objects are rejected instead of being labelled as produce.
5. User feedback saved by the app in `data/feedback/` (see below).

The data is split 80/10/10 into train, validation and test sets, stratified by (type, freshness).
Test-set results are stored in `models/metrics.json`, and the app serves them at `GET /api/model/info`.

**Limitation:** fresh/rotten training images exist only for apple, banana, bell pepper, carrot, cucumber,
mango, orange, potato, strawberry and tomato. For the other types the app identifies the produce,
assumes it is fresh (quality 0.8), and tells the user that freshness was not assessed.
`freshness_reliable: false` is set in the API response (see `freshness_untrained_classes` in `models/labels.json`).

## Feedback: "Is this correct?"

After every scan the app asks whether the result is correct.

- **Yes**: the photo is saved as a confirmed example.
- **No**: the user picks the right item or types any name (for example "kiwi" or "person").

Each answer is stored by the server in `data/feedback/`: the photo, the label, and the model's
1280-number image embedding. This folder is not committed to git. Feedback is used in two ways:

1. **Immediately.** Every new scan is compared with the saved feedback photos using cosine
   similarity. If a saved photo is at least 90% similar, or at least 80% similar while the model
   is unsure, the user's label is used. The app then shows "Recognised from earlier user feedback".
   This also works for names the model was never trained on.
2. **At the next retraining.** `npm run train` adds feedback photos whose label is a known class to
   the training set. They are used for training only, never for the reported test accuracy.

On hosts with temporary disks (for example Render's free plan), `data/feedback/` is wiped on every
redeploy. To keep feedback permanently there, move it to a database.

## AI components (where to find them)

```
src/
├── ai_engines/                 ← all AI logic, runs on the server only
│   ├── PredictiveAI.ts         Deep-learning vision model (ONNX) + Arrhenius shelf-life prediction
│   ├── RAGModel.ts             Retrieval over the BioFresh knowledge base (src/lib/ragKnowledge.ts)
│   ├── GenerativeAI.ts         ★ Generative AI: Gemini writes a rescue plan grounded in retrieved docs (RAG)
│   ├── AgenticAI.ts            ★ Agentic AI: Kitchen Rescue Agent, a tool-calling loop (max 6 steps)
│   ├── tools.ts                Tools the agent can call: inventory, shelf life, knowledge base, weather, reminders
│   └── llm.ts                  Gemini connection; picks the newest stable "flash" model automatically
├── server/produceModel.ts      Runs the trained model; averages 3 views of each photo
├── components/AIAssistant.tsx  "✨ AI" tab: rescue plan + agent with its step-by-step trace
ml/train.py                     Trains the vision model on the Kaggle datasets
tests/ai_engines.test.ts        Tests for the agent loop and GenAI (scripted model, no key needed)
```

| Feature | Type | How it works |
|---|---|---|
| Produce + freshness recognition | Predictive AI (deep learning) | EfficientNet-B0 trained on Kaggle images, served as ONNX |
| Shelf life | Physics model | Arrhenius kinetics on the predicted freshness and storage temperature |
| AI Rescue Plan | **Generative AI + RAG** | Retrieve knowledge-base docs → Gemini generates JSON (recipes, storage tips, zero-waste tip) citing [S1], [S2]. Rotten items never get recipes. |
| Kitchen Rescue Agent | **Agentic AI** | Gemini receives a goal plus 5 tool definitions, decides which tools to call, the server runs them and returns the results, repeated until it answers. The app shows each step and applies the reminders it schedules. |

**Setup:** create a free key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY`
in `.env` (local) or in Render → Environment. Check `GET /api/ai/status`. Without a key, both
features run in a clearly labelled offline mode using the same tools and knowledge base.

Run the tests with `npm test`.

## Run the app

Requires Node.js 20+.

```bash
npm install
npm run dev          # development, http://localhost:3000
```

Production mode (the same commands a host like Render runs):

```bash
npm run build        # builds the website into dist/
npm start            # serves dist/ + the API; PORT env var sets the port (default 3000)
```

The trained model in `models/` is committed, so the app works without retraining.
Firebase (login and scan history) uses `firebase-applet-config.json`.

## Deploy to Render (free)

1. Push this repo to GitHub.
2. On [render.com](https://render.com), sign in with GitHub, then choose **New → Blueprint** and pick this repo.
   Render reads [`render.yaml`](render.yaml) and fills in every setting (free plan, build/start commands, Node 22).
   To set it up by hand instead, use **New → Web Service** with:
   - **Runtime:** Node
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Instance type:** Free
   - **Environment variable:** `ONNXRUNTIME_NODE_INSTALL` = `skip` (avoids downloading unused GPU libraries)
3. Deploy, then open `https://<your-app>.onrender.com/api/model/info`. It should show `"available": true`.
4. In the Firebase console (project `gen-lang-client-0979288524`), go to **Authentication → Settings → Authorized domains**
   and add `<your-app>.onrender.com`. Without this, Google login fails with `auth/unauthorized-domain`.
5. Also in Firebase: **Authentication → Sign-in method**, enable **Google** and **Anonymous**.

Notes:

- On the free plan the app sleeps after about 15 minutes without visitors. The first visit after that takes 30–60 seconds.
- Saved feedback (`data/feedback/`) is lost on every redeploy or restart. To keep it, attach a Render disk
  (paid) and set the environment variable `FEEDBACK_DIR=/var/data/feedback`.
- The camera only works over `https://`, which Render provides automatically.

## Retrain the model

Requires Python 3.10+. An NVIDIA GPU is optional; training takes about 15 minutes on an RTX 3050.

```bash
npm run setup:ml
# For GPU training, install the CUDA build of torch into the venv:
ml/.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
npm run train        # downloads datasets, trains, writes models/
```

The datasets total about 12 GB. If kagglehub stalls, download them into `ml/data/<dataset-name>/`
with any tool you like; `train.py` uses those folders first.

## API

| Endpoint | Description |
|---|---|
| `POST /api/predict` `{ image: dataURL }` | Produce type, quality score, confidence, alternatives |
| `POST /api/feedback` `{ image, predicted, correct, label? }` | Save the answer to "Is this correct?" |
| `GET /api/feedback/stats` | How much feedback has been collected |
| `GET /api/model/info` | Model classes and test metrics |
| `GET /api/ai/status` | Whether Gemini is configured, and which model is used |
| `POST /api/genai/rescue-plan` | Generative AI rescue plan for a scan (RAG-grounded) |
| `POST /api/agent/run` `{ goal, inventory[], weather? }` | Run the Kitchen Rescue Agent; returns its answer, steps and actions |
| `GET /api/weather?lat=&lon=` | Open-Meteo temperature and humidity (the app falls back to 20 °C / 60 % if this is unavailable) |
