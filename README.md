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
| Architecture | EfficientNet-B0 (ImageNet pre-trained), two heads: produce type (14 classes) and fresh vs rotten |
| Training script | [`ml/train.py`](ml/train.py) |
| Output | `models/produce_model.onnx`, `models/labels.json`, `models/metrics.json` (held-out test accuracy) |
| Classes | apple, avocado, banana, bell_pepper, carrot, cucumber, lemon, lime, mango, orange, papaya, potato, strawberry, tomato |

**Datasets** (downloaded automatically, no Kaggle login needed):

1. [Fruits and Vegetables Dataset](https://www.kaggle.com/datasets/muhriddinmuxiddinov/fruits-and-vegetables-dataset): 12,000 images, 10 types, fresh and rotten
2. [Fruits fresh and rotten for classification](https://www.kaggle.com/datasets/sriramr/fruits-fresh-and-rotten-for-classification): apple, banana and orange, fresh and rotten. The duplicated folders are removed, and each group is capped at 1,500 images for class balance.
3. [Fruits-360](https://www.kaggle.com/datasets/moltean/fruits): type labels only. It adds avocado, lemon, lime and papaya.

The data is split 80/10/10 into train, validation and test sets, stratified by (type, freshness).
Test-set results are stored in `models/metrics.json`, and the app serves them at `GET /api/model/info`.

**Limitation:** avocado, lemon, lime and papaya have no fresh/rotten training images. For these
types the app identifies the produce, assumes it is fresh (quality 0.8), and tells the user that
freshness was not assessed. `freshness_reliable: false` is set in the API response.

## Run the app

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

The trained model in `models/` is committed, so the app works without retraining.
Firebase (login and scan history) uses `firebase-applet-config.json`.

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
| `GET /api/model/info` | Model classes and test metrics |
| `GET /api/weather?lat=&lon=` | Open-Meteo temperature and humidity (the app falls back to 20 °C / 60 % if this is unavailable) |
