# Benchmark items — for vision model comparison

**Goal:** 20 real UK clothing items your fiancée wants to list on Vinted.

## What to do (10 minutes)

For each of 20 items:

1. **Take one photo.** Phone camera is fine. Natural daylight on a plain surface (bed, table, floor). Whole item visible. Item on a hanger is fine. No special lighting, no staging.
2. **Name the file** `item-01.jpg`, `item-02.jpg`, … `item-20.jpg`. Mixed `.jpg`/`.png`/`.heic` is fine.
3. **Create a matching truth file** `item-01.truth.json` next to the photo — this is the ground truth the benchmark grades against.

## Truth file schema

```json
{
  "brand": "Next",
  "category": "dress",
  "size": "10",
  "color": "navy",
  "conditionSelfRated": "good"
}
```

- **brand** — exact brand name as it appears on the label. Case doesn't matter, spelling does. Examples: `"Next"`, `"Primark"`, `"M&S"`, `"Uniqlo"`, `"Zara"`, `"New Look"`, `"H&M"`.
- **category** — one of: `dress`, `top`, `t-shirt`, `skirt`, `trousers`, `jeans`, `jacket`, `coat`, `shoes`, `handbag`, `other`.
- **size** — UK size. Dresses/tops: `"10"`, `"12"`. Men's tops: `"M"`, `"L"`. Shoes: `"40"`, `"8"`. If unreadable: `"unknown"`.
- **color** — dominant color, single word. `"navy"`, `"cream"`, `"olive"`.
- **conditionSelfRated** — `"new"`, `"excellent"`, `"good"`, `"fair"`. Your honest take.

## Distribution guide

For a fair benchmark, aim for variety:
- **At least 12 brands** across the 20 items (don't use Next 15 times).
- **At least 3 categories** (not all dresses).
- **Mix of hanger shots and flat-lay.**
- **Include 2 "hard" items** — a charity-shop no-logo item, a worn-label item — to stress-test the model.

## Where these files live

Photos and truth files are **gitignored** (they have your fiancée's items in them; personal).
Only this README + `example.truth.json` are committed.

## Running the benchmark

Once all 20 are in place:

```bash
# Copy keys to .env first (see ../../.env.example)
npm run benchmark
```

Output appears at `docs/model-benchmark.md` with per-item accuracy, latency and cost.
