"""
BioFresh-CV produce model training.

Trains one EfficientNet-B0 network with two heads on public Kaggle datasets:
  * type head      -> which produce item is in the photo (softmax)
  * freshness head -> probability the item is fresh vs rotten/stale (sigmoid)

The freshness probability is used by the app as the visual quality score (0..1)
that feeds the Arrhenius shelf-life engine in src/lib/science.ts.

Datasets (downloaded automatically with kagglehub, no Kaggle login needed):
  1. muhriddinmuxiddinov/fruits-and-vegetables-dataset   (10 types, fresh/rotten)
  2. sriramr/fruits-fresh-and-rotten-for-classification   (apple/banana/orange, fresh/rotten)
  3. moltean/fruits (Fruits-360)                          (type labels only, adds
     avocado, lemon, lime, papaya; freshness loss is masked for these images)
  3b. kritikseth/fruit-and-vegetable-image-recognition    (real-world web photos, 36 types:
     grapes, onion, kiwi, pear, pomegranate, pineapple, ... ; type labels only)
  4. prasunroy/natural-images + jessicali9530/lfw-dataset (people, faces, animals,
     vehicles, objects) -> the "not_produce" class, so non-produce photos are rejected
  5. User feedback saved by the app in data/feedback/ (trained classes only)

Usage:
  ml/.venv/Scripts/python ml/train.py            # full training + ONNX export
  ml/.venv/Scripts/python ml/train.py --epochs 1 # quick smoke run

Outputs (in models/):
  produce_model.onnx   model used by server.ts
  labels.json          class names + preprocessing config
  metrics.json         held-out test metrics
"""
import argparse
import json
import random
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import kagglehub
import torch
import torch.nn as nn
from PIL import Image, ImageFile
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

ImageFile.LOAD_TRUNCATED_IMAGES = True

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "models"
IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
IMG_SIZE = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]

# Folder-name keyword -> app produce id (must match keys in src/lib/science.ts).
# Order matters: more specific keywords first.
# e.g. "chilli pepper" must hit "chilli" before "pepper", "pineapple" before "apple",
# "sweetpotato" before "potato", and "Pepper Orange" must hit "pepper" before "orange".
TYPE_KEYWORDS = [
    ("bellpepper", "bell_pepper"), ("capsicum", "bell_pepper"), ("paprika", "bell_pepper"),
    ("chilli", "chilli_pepper"), ("chili", "chilli_pepper"), ("jalepeno", "chilli_pepper"), ("jalapeno", "chilli_pepper"),
    ("pepper", "bell_pepper"),
    ("strawberr", "strawberry"), ("stawberr", "strawberry"), ("avocado", "avocado"), ("papaya", "papaya"),
    ("pineapple", "pineapple"), ("pinenapple", "pineapple"), ("watermelon", "watermelon"), ("pomegranate", "pomegranate"),  # "pinenapple": misspelled folder in fruit-classification10
    ("lemon", "lemon"), ("lime", "lime"), ("mango", "mango"), ("banana", "banana"),
    ("orange", "orange"), ("tomato", "tomato"), ("cucumber", "cucumber"), ("carrot", "carrot"),
    ("sweetpotato", "sweet_potato"), ("potatosweet", "sweet_potato"), ("potato", "potato"),
    ("grape", "grapes"), ("kiwi", "kiwi"), ("pear", "pear"), ("onion", "onion"),
    ("garlic", "garlic"), ("ginger", "ginger"), ("cabbage", "cabbage"), ("cauliflower", "cauliflower"),
    ("eggplant", "eggplant"), ("aubergine", "eggplant"), ("brinjal", "eggplant"), ("sweetcorn", "corn"), ("corn", "corn"),
    ("beetroot", "beetroot"), ("lettuce", "leafy_greens"), ("spinach", "leafy_greens"),
    ("peas", "peas"), ("raddish", "radish"), ("radish", "radish"), ("turnip", "turnip"),
    ("apple", "apple"),
]
# Classes the fresh/rotten datasets cover; Fruits-360 studio shots of these stay a small minority
FRESHROTTEN_CLASSES = {"apple", "banana", "mango", "orange", "strawberry", "bell_pepper",
                       "carrot", "cucumber", "potato", "tomato"}
TYPE_ONLY_CAP = 250  # Fruits-360 studio shots per type (real-world photos exist for every type)
STUDIO_ONLY_CLASSES: set[str] = set()
STUDIO_ONLY_CAP = 250
# Folders that contain a keyword but are a different item (or an item we don't model).
EXCLUDE = ("mangostan", "pepino", "custard", "rosehip", "grapefruit", "soybean", "pomelo")
# Real-world web photos (varied backgrounds and lighting): oversampled in training, and scored separately
WEB_MARKS = ("fruit-and-vegetable-image-recognition", "fruit-classification10-class",
             "vegetable-image-dataset", "fruitnet-indian-fruits-dataset-with-quality")
WEB_OVERSAMPLE = 2


def is_web(path: str) -> bool:
    return any(m in path for m in WEB_MARKS)

# Images of anything that is NOT produce (people, faces, animals, vehicles, objects) teach the
# model to answer "not_produce" instead of forcing every photo into a produce class.
REJECT_CLASS = "not_produce"
NEGATIVE_EXCLUDE = ("fruit", "strawberry", "pineapple")  # produce folders inside the negative datasets

DATASETS = [
    ("muhriddinmuxiddinov/fruits-and-vegetables-dataset", "freshrotten", None),
    ("sriramr/fruits-fresh-and-rotten-for-classification", "freshrotten", 1500),  # cap per (type, fresh) group to keep classes balanced
    ("moltean/fruits", "typeonly", 250),  # cap per type: studio shots, keep them a minority
    ("kritikseth/fruit-and-vegetable-image-recognition", "web", None),  # 36 types, real-world web photos
    ("karimabdulnabi/fruit-classification10-class", "web", None),  # web photos incl. avocado, kiwi
    ("misrakahmed/vegetable-image-dataset", "web", 500),  # real photos; brinjal, papaya, radish, ... (cap per type)
    ("shashwatwork/fruitnet-indian-fruits-dataset-with-quality", "freshrotten", 600),  # good/bad: lime, pomegranate, ...
    ("prasunroy/natural-images", "negative", (400, None)),  # airplane, car, cat, dog, flower, motorbike, person
    ("jessicali9530/lfw-dataset", "negative", (20, 1000)),  # human faces (max 20 per person, 1000 total)
    ("imbikramsaha/caltech-101", "negative", (30, None)),  # 100 everyday object categories (mugs, chairs, ...)
]

# User feedback saved by the app (POST /api/feedback). Samples whose label is one of the trained
# classes are added to the training set the next time this script runs.
FEEDBACK_FILE = ROOT / "data" / "feedback" / "feedback.json"


def folder_type(name: str):
    n = re.sub(r"[^a-z]", "", name.lower())
    if any(e.replace(" ", "") in n for e in EXCLUDE):
        return None
    for kw, pid in TYPE_KEYWORDS:
        if kw in n:
            return pid
    return None


def folder_fresh(name: str):
    n = name.lower()
    if "rotten" in n or "stale" in n or re.search(r"(^|[_ ])bad($|[_ ])", n):
        return 0
    if "fresh" in n or re.search(r"(^|[_ ])good($|[_ ])", n):
        return 1
    return None


def scan_dataset(root: Path, mode: str, cap):
    """Return list of (path, type, fresh) where fresh is 1/0, or -1 when unknown."""
    items = []
    if mode == "negative":
        per_group, total = cap
        seen, groups = set(), defaultdict(list)
        for p in root.rglob("*"):
            if p.suffix.lower() not in IMG_EXT or any(e in p.parent.name.lower() for e in NEGATIVE_EXCLUDE):
                continue
            key = (p.parent.name.lower(), p.name.lower(), p.stat().st_size)
            if key not in seen:
                seen.add(key)
                groups[p.parent.name.lower()].append(str(p))
        rng = random.Random(0)
        for g in sorted(groups):
            paths = sorted(groups[g]); rng.shuffle(paths)
            items += [(q, REJECT_CLASS, -1) for q in paths[:per_group]]
        rng.shuffle(items)
        return items[:total] if total else items
    if mode == "typeonly":
        # Fruits-360 ships several variants; use only the 100x100 Training/Test sets.
        dirs = [d for d in root.rglob("*") if d.is_dir() and d.name in ("Training", "Test")]
        pref = [d for d in dirs if "100x100" in str(d)]
        dirs = pref or dirs
        per_type = defaultdict(list)
        for split in dirs:
            for cls in split.iterdir():
                t = folder_type(cls.name) if cls.is_dir() else None
                if t:
                    per_type[t] += [p for p in cls.iterdir() if p.suffix.lower() in IMG_EXT]
        rng = random.Random(0)
        for t, paths in per_type.items():
            paths.sort(); rng.shuffle(paths)
            # Types without fresh/rotten data get more images so they aren't under-represented
            n = cap if t in FRESHROTTEN_CLASSES else STUDIO_ONLY_CAP if t in STUDIO_ONLY_CLASSES else TYPE_ONLY_CAP
            items += [(str(p), t, -1) for p in paths[:n]]
        return items

    if mode == "web":
        # train/ test/ validation/ folders per type; test and validation repeat the same files
        seen, per_type = set(), defaultdict(list)
        for cls in (d for d in root.rglob("*") if d.is_dir()):
            t = folder_type(cls.name)
            if not t:
                continue
            for p in cls.iterdir():
                key = (cls.name.lower(), p.name.lower(), p.stat().st_size)
                if p.suffix.lower() in IMG_EXT and key not in seen:
                    seen.add(key)
                    per_type[t].append(str(p))
        rng = random.Random(0)
        for t, paths in per_type.items():
            paths.sort(); rng.shuffle(paths)
            items += [(q, t, -1) for q in (paths[:cap] if cap else paths)]
        return items

    # Some Kaggle uploads contain the same folders twice (e.g. dataset/ and dataset/dataset/).
    # De-duplicate by (folder, file name, size) so copies can't leak between train and test.
    seen, groups = set(), defaultdict(list)
    for cls in (d for d in root.rglob("*") if d.is_dir()):
        t, f = folder_type(cls.name), folder_fresh(cls.name)
        if t is None or f is None:
            continue
        for p in cls.iterdir():
            if p.suffix.lower() not in IMG_EXT:
                continue
            key = (cls.name.lower(), p.name.lower(), p.stat().st_size)
            if key not in seen:
                seen.add(key)
                groups[(t, f)].append(str(p))
    rng = random.Random(0)
    for (t, f), paths in groups.items():
        paths.sort(); rng.shuffle(paths)
        items += [(p, t, f) for p in (paths[:cap] if cap else paths)]
    return items


class ProduceDataset(Dataset):
    def __init__(self, items, class_to_idx, tfm):
        self.items, self.c2i, self.tfm = items, class_to_idx, tfm

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        path, t, f = self.items[i]
        try:
            img = Image.open(path).convert("RGB")
        except Exception:
            img = Image.new("RGB", (IMG_SIZE, IMG_SIZE))
        return self.tfm(img), self.c2i[t], torch.tensor(float(f))


class ProduceNet(nn.Module):
    def __init__(self, n_types: int):
        super().__init__()
        backbone = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        self.features = backbone.features
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.type_head = nn.Sequential(nn.Dropout(0.3), nn.Linear(1280, n_types))
        self.fresh_head = nn.Sequential(nn.Dropout(0.3), nn.Linear(1280, 1))

    def embed(self, x):
        return self.pool(self.features(x)).flatten(1)

    def forward(self, x):
        z = self.embed(x)
        return self.type_head(z), self.fresh_head(z).squeeze(1)


class ExportWrapper(nn.Module):
    """Bakes normalisation + softmax/sigmoid into the graph so the server only feeds 0..1 RGB."""

    def __init__(self, net):
        super().__init__()
        self.net = net
        self.register_buffer("mean", torch.tensor(MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(STD).view(1, 3, 1, 1))

    def forward(self, x):
        z = self.net.embed((x - self.mean) / self.std)
        t, f = self.net.type_head(z), self.net.fresh_head(z).squeeze(1)
        # L2-normalised embedding: the server compares it (cosine similarity) with saved feedback
        return torch.softmax(t, dim=1), torch.sigmoid(f), nn.functional.normalize(z, dim=1)


def load_feedback(classes):
    """User corrections saved by the app: known produce labels, and non-produce labels -> not_produce."""
    try:
        entries = json.loads(FEEDBACK_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    out = []
    for e in entries:
        path = FEEDBACK_FILE.parent / e["image"]
        if not path.exists():
            continue
        if e.get("is_produce") is False:
            out.append((str(path), REJECT_CLASS, -1))  # e.g. a selfie labelled "human"
        elif e["label"] in classes:
            out.append((str(path), e["label"], -1))
    return out


def split(items, seed=42):
    """Stratified 80/10/10 split per (type, fresh) group."""
    groups = defaultdict(list)
    for it in items:
        groups[(it[1], it[2])].append(it)
    rng = random.Random(seed)
    tr, va, te = [], [], []
    for g in groups.values():
        rng.shuffle(g)
        n = len(g)
        a, b = int(n * 0.8), int(n * 0.9)
        tr += g[:a]; va += g[a:b]; te += g[b:]
    return tr, va, te


@torch.no_grad()
def evaluate(model, loader, device, n_types):
    model.eval()
    t_ok = t_n = f_ok = f_n = 0
    conf = torch.zeros(n_types, n_types, dtype=torch.long)
    for x, t, f in loader:
        x, t, f = x.to(device), t.to(device), f.to(device)
        with torch.autocast(device.type, enabled=device.type == "cuda"):
            tl, fl = model(x)
        pred = tl.argmax(1)
        t_ok += (pred == t).sum().item(); t_n += len(t)
        for a, b in zip(t.cpu(), pred.cpu()):
            conf[a, b] += 1
        m = f >= 0
        if m.any():
            f_ok += ((fl[m] > 0).float() == f[m]).sum().item(); f_n += m.sum().item()
    return t_ok / max(1, t_n), f_ok / max(1, f_n), conf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--batch", type=int, default=48)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--export-only", action="store_true",
                    help="skip training: evaluate + export the saved models/best.pt (e.g. after a crash)")
    args = ap.parse_args()

    random.seed(0); torch.manual_seed(0)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    items, sources = [], {}
    for slug, mode, cap in DATASETS:
        # Prefer a manually downloaded copy in ml/data/<name>/ (resumable curl download),
        # otherwise fetch through kagglehub's cache.
        local = ROOT / "ml" / "data" / slug.split("/")[1]
        path = local if local.is_dir() else Path(kagglehub.dataset_download(slug))
        got = scan_dataset(path, mode, cap)
        sources[slug] = len(got)
        print(f"{slug}: {len(got)} images")
        items += got

    classes = sorted({t for _, t, _ in items})
    feedback = load_feedback(set(classes))
    print(f"User feedback samples added: {len(feedback)}")
    c2i = {c: i for i, c in enumerate(classes)}
    print("Classes:", classes)
    print("Per class:", dict(Counter(t for _, t, _ in items)))

    tr, va, te = split(items)
    tr += [it for it in tr if is_web(it[0])] * (WEB_OVERSAMPLE - 1)  # real-world photos count double
    tr += feedback  # feedback is only used for training, never for the reported test metrics
    te_web = [it for it in te if is_web(it[0])]
    print(f"train={len(tr)} val={len(va)} test={len(te)}")

    train_tfm = transforms.Compose([
        transforms.RandomResizedCrop(IMG_SIZE, scale=(0.5, 1.0)),
        transforms.RandomHorizontalFlip(), transforms.RandomVerticalFlip(),
        transforms.RandomRotation(20),
        transforms.RandomPerspective(0.2, p=0.25),
        # Mild colour jitter only: colour is a real freshness signal.
        transforms.ColorJitter(0.25, 0.25, 0.15, 0.02),
        transforms.RandomApply([transforms.GaussianBlur(5, sigma=(0.1, 2.0))], p=0.2),  # phone blur / focus
        transforms.ToTensor(), transforms.Normalize(MEAN, STD),
        transforms.RandomErasing(p=0.2, scale=(0.02, 0.15)),  # partly hidden items (hands, other objects)
    ])
    eval_tfm = transforms.Compose([
        transforms.Resize((IMG_SIZE, IMG_SIZE)),
        transforms.ToTensor(), transforms.Normalize(MEAN, STD),
    ])
    kw = dict(batch_size=args.batch, num_workers=args.workers, pin_memory=True, persistent_workers=args.workers > 0)
    # Mild class balancing: each sample weighted 1/sqrt(class size), so big classes such as
    # not_produce don't dominate (that made the model reject real produce photos).
    counts = Counter(t for _, t, _ in tr)
    weights = torch.tensor([1.0 / counts[t] ** 0.5 for _, t, _ in tr], dtype=torch.double)
    sampler = torch.utils.data.WeightedRandomSampler(weights, num_samples=len(tr), replacement=True)
    train_dl = DataLoader(ProduceDataset(tr, c2i, train_tfm), sampler=sampler, drop_last=True, **kw)
    val_dl = DataLoader(ProduceDataset(va, c2i, eval_tfm), **kw)
    test_dl = DataLoader(ProduceDataset(te, c2i, eval_tfm), **kw)
    test_web_dl = DataLoader(ProduceDataset(te_web, c2i, eval_tfm), **kw)

    model = ProduceNet(len(classes)).to(device)
    opt = torch.optim.AdamW([
        {"params": model.features.parameters(), "lr": 3e-4},
        {"params": list(model.type_head.parameters()) + list(model.fresh_head.parameters()), "lr": 1e-3},
    ], weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=[3e-4, 1e-3], total_steps=args.epochs * len(train_dl), pct_start=0.15)
    scaler = torch.amp.GradScaler(enabled=device.type == "cuda")
    ce = nn.CrossEntropyLoss(label_smoothing=0.05)
    bce = nn.BCEWithLogitsLoss()

    OUT_DIR.mkdir(exist_ok=True)
    best, best_path = -1.0, OUT_DIR / "best.pt"
    if args.export_only:
        if not best_path.exists():
            raise SystemExit("models/best.pt not found; train first")
        print("Export only: using the saved best checkpoint")
    for ep in range(0 if args.export_only else args.epochs):
        model.train(); t0 = time.time(); run = 0.0
        for i, (x, t, f) in enumerate(train_dl):
            x, t, f = x.to(device, non_blocking=True), t.to(device), f.to(device)
            with torch.autocast(device.type, enabled=device.type == "cuda"):
                tl, fl = model(x)
                loss = ce(tl, t)
                m = f >= 0
                if m.any():
                    loss = loss + bce(fl[m].float(), f[m])
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt); scaler.update(); sched.step()
            run += loss.item()
            if i % 100 == 0:
                print(f"  ep{ep+1} step {i}/{len(train_dl)} loss {run/(i+1):.4f}", flush=True)
        ta, fa, _ = evaluate(model, val_dl, device, len(classes))
        print(f"Epoch {ep+1}/{args.epochs}  val type_acc={ta:.4f} fresh_acc={fa:.4f}  ({time.time()-t0:.0f}s)", flush=True)
        if ta + fa > best:
            best = ta + fa
            torch.save(model.state_dict(), best_path)

    model.load_state_dict(torch.load(best_path, map_location=device))
    ta, fa, conf = evaluate(model, test_dl, device, len(classes))
    per_class = {c: round(conf[i, i].item() / max(1, conf[i].sum().item()), 4) for i, c in enumerate(classes)}
    web_acc = evaluate(model, test_web_dl, device, len(classes))[0] if te_web else None
    print(f"TEST type_acc={ta:.4f} fresh_acc={fa:.4f}  real-world web photos: {web_acc} ({len(te_web)} imgs)")
    print("Per-class type accuracy:", per_class)

    # Export ONNX (fp32, CPU) for onnxruntime-node in server.ts
    wrapper = ExportWrapper(model.cpu().eval()).eval()
    dummy = torch.rand(1, 3, IMG_SIZE, IMG_SIZE)
    torch.onnx.export(
        wrapper, dummy, OUT_DIR / "produce_model.onnx",
        input_names=["image"], output_names=["type_probs", "fresh_prob", "embedding"],
        dynamic_axes={"image": {0: "batch"}, "type_probs": {0: "batch"}, "fresh_prob": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=17, dynamo=False,
    )
    trained_at = time.strftime("%Y-%m-%d %H:%M")
    (OUT_DIR / "labels.json").write_text(json.dumps({
        "classes": classes, "input_size": IMG_SIZE, "input": "RGB float32 NCHW in [0,1]",
        # Classes with no fresh/rotten training images: the freshness output is not reliable for them
        "freshness_untrained_classes": sorted(set(classes) - {t for _, t, f in items if f >= 0} - {REJECT_CLASS}),
        "model_version": trained_at,
        "reject_class": REJECT_CLASS,
        "architecture": "EfficientNet-B0 (ImageNet pretrained) + type head + freshness head",
    }, indent=2))
    (OUT_DIR / "metrics.json").write_text(json.dumps({
        "test_type_accuracy": round(ta, 4), "test_freshness_accuracy": round(fa, 4),
        "test_real_world_type_accuracy": round(web_acc, 4) if web_acc is not None else None,
        "test_real_world_images": len(te_web),
        "per_class_type_accuracy": per_class, "epochs": args.epochs,
        "train_images": len(tr), "val_images": len(va), "test_images": len(te),
        "datasets": sources, "feedback_samples": len(feedback), "trained_at": trained_at,
    }, indent=2))
    best_path.unlink(missing_ok=True)
    print(f"Saved model to {OUT_DIR}")


if __name__ == "__main__":
    main()
