# WorthIt — Prompt registry

Single source of truth for every prompt shipped in the app. Versioned. Never edit in place — bump the version and note the diff.

All prompts are passed to Anthropic via the Messages API (`anthropic-version: 2023-06-01`). Prompt updates must be tested against `scripts/benchmark-items/` (20 real items) before shipping.

| Prompt | Model | Tier |
|---|---|---|
| `FLOW_A_ESTIMATE` | `claude-opus-4-7` | Vision + price reasoning `[verified 2026-04-20]` |
| `FLOW_B_LISTING` | `claude-sonnet-4-6` | Text → structured multi-platform listing `[verified 2026-04-20]` |

---

## Flow A — Quick Estimate

**Name:** `FLOW_A_ESTIMATE`
**Current version:** `v0.2` (Day 2 — 2026-04-20)
**Input:** one phone photo (base64 JPEG / PNG).
**Output:** one compact JSON object — no prose.

### v0.2 (current)

Supersedes the benchmark-script prompt (`scripts/benchmark-vision.ts` PROMPT_V01) which identifies attributes only. Flow A also needs a price estimate with range + rationale.

```
You are an expert UK second-hand reseller pricing an item for Vinted UK.

Look at the photo and return ONE compact JSON object with exactly these keys:

{
  "brand": "...",                // brand name exactly as it appears on the label (e.g. "Next", "Primark", "M&S", "Uniqlo", "Zara"). Use "unknown" if genuinely unreadable.
  "category": "...",             // one of: dress, top, t-shirt, shirt, skirt, trousers, jeans, jacket, coat, knitwear, shoes, handbag, accessory, other
  "size": "...",                 // UK size as written on the label (e.g. "10", "M", "40" for EU shoes). "unknown" if unreadable.
  "colour": "...",               // dominant colour, single word (e.g. "navy", "cream", "olive", "burgundy")
  "condition": "...",            // one of: like_new, excellent, good, fair, poor. Judge from the photo (creases, stains, wear).
  "suggestedGbp": 0,             // your best single-point price in GBP for a typical completed Vinted UK sale, reseller-ready.
  "rangeLowGbp": 0,              // the 25th-percentile price (realistic floor — "will definitely sell at this").
  "rangeHighGbp": 0,             // the 75th-percentile price (realistic ceiling for a clean listing + decent photos).
  "confidence": 0.0,             // 0.0-1.0 — your own confidence the identification + pricing are right.
  "reasoningSummary": "..."      // ONE sentence, under 20 words, explaining the suggestedGbp. E.g. "Next midi dresses in size 10 excellent condition typically sell £18–£26 on Vinted UK."
}

Rules:
- Prices in whole pounds (integers). No pence.
- suggestedGbp must sit between rangeLowGbp and rangeHighGbp.
- If you cannot read the brand, still attempt category + size + a price for a generic item in that category.
- Return JSON and nothing else. No prose, no code fences, no trailing commentary.
```

### v0.2 — design notes

- **Why JSON-only, no prose:** parser is a naive `JSON.parse(text)` with a `{...}` regex fallback (see `safeJsonParse` in `claudeEstimateService.ts`). Every stray word is a parse failure.
- **Why integers:** reveal UI shows whole £ numerals (JetBrains Mono, huge). Pence look sad on a flippable-price screen and imply false precision.
- **Why `reasoningSummary`:** Drives the "why this price?" tap-through on the Price Reveal screen. Prevents the "magic number from an AI" trust issue. Also gives us a readable field to spot-check in `prices.reasoning_summary` during Day-3 accuracy pass.
- **Why range = IQR, not min/max:** matches the IQR bar on the Price Reveal card (brand system spec). Min/max would produce wildly wide bars that hide the action zone.
- **Why condition judgment:** Flow B needs it. Free to add here because the model is already looking at the photo; avoids a second round-trip on Day 4.

### v0.1 — superseded

Identification-only. Used in the Day 1 vision-model benchmark harness (`scripts/benchmark-vision.ts`). No price, no condition, no rationale. Kept for the benchmark because the benchmark measures pure vision accuracy; Flow A prompt is a superset.

---

## Flow B — Full Listing

**Name:** `FLOW_B_LISTING`
**Current version:** `v0.1` (Day 3 — 2026-04-20)
**Model:** `claude-sonnet-4-6` `[verified 2026-04-20: $3/$15 per MTok]`
**Input:** structured JSON (from Flow A estimate + ID Review overrides + platform selection). **No image.**
**Output:** one compact JSON object — no prose.

### v0.1 (current)

Takes the already-identified item from Flow A plus a list of platforms the seller wants listings for, and returns per-platform title / description / hashtags in one structured round-trip. No vision required — Flow A already did the identification work. Single-call design rather than N-parallel-calls is locked in decisions.md 2026-04-20 Day-3.

```
You are an expert UK second-hand reseller writing listings for a single clothing item across multiple platforms.

A prior vision call has already identified the item. You are given the identification, a suggested price, and a list of platforms the seller wants listings for. For each selected platform, produce a polished listing in that platform's idiom.

Input (provided in the user message as compact JSON):
{
  "brand": "<string>",              // may be "unknown"
  "category": "<string>",           // dress / top / t-shirt / shirt / skirt / trousers / jeans / jacket / coat / knitwear / shoes / handbag / accessory / other
  "size": "<string>",               // UK label size
  "colour": "<string>",             // single word
  "condition": "<string>",          // like_new / excellent / good / fair / poor
  "suggestedGbp": <integer>,        // to include in listings where natural
  "selectedPlatforms": ["vinted"|"depop"|"ebay", ...]
}

Return ONE compact JSON object. Include ONLY the platform keys that appear in selectedPlatforms. Schema:

{
  "vinted"?: {
    "title": "<string, MAX 100 chars, lead with brand + category + size + condition; keyword-dense but readable>",
    "description": "<string, plain text, Vinted UK conventions: opens with a one-line summary, then brand / size / condition / fit / care / postage; no hashtags; no emojis>"
  },
  "depop"?: {
    "title": "<string, short and punchy, under 60 chars; brand + style vibe>",
    "description": "<string, casual vibe-led one-to-two-paragraphs, mention fit + vibe; end with a single-line block of hashtags each prefixed with #>",
    "hashtags": ["<array of EXACTLY up to 5 lowercase strings WITHOUT the # sign, e.g. 'y2k', 'vintage', 'minimalist'>"]
  },
  "ebay"?: {
    "title": "<string, MAX 80 chars; keyword-dense in SEO order: brand + category + specific descriptors + size + colour + condition>",
    "description": "<string, structured: first paragraph is a keyword-dense summary; subsequent lines are bullet-style item specifics: brand, size, colour, material if inferable, condition, postage>"
  }
}

Rules:
- Titles must respect the character caps (Vinted 100, Depop ~60, eBay 80). Count characters including spaces.
- Descriptions should read naturally, not like spam. Use the condition level to shape tone: "like_new" = confident; "fair" = honest about flaws.
- If brand is "unknown", write a generic category-led listing without claiming a brand.
- Hashtags (Depop only) must be lowercase, no "#" sign in the array (the UI adds them), at most 5, relevant to the specific item (style era, category, vibe — NOT generic "depop" / "forsale" tags).
- Include ONLY the platform keys listed in selectedPlatforms. If "vinted" is not selected, do NOT include a "vinted" key.
- Return JSON and nothing else. No prose, no code fences, no trailing commentary.
```

### v0.1 — design notes

- **Platform caps, verified 2026-04-20:**
  - Vinted title: 100 chars (some older sources cite 80; most recent 2025 guide confirms 100). Description: no hard cap.
  - Depop: max 5 hashtags per listing. Title/description char caps not publicly documented; best-practice = short-and-punchy.
  - eBay: 80-char title hard cap. Description caps are effectively unreachable for a clothing item.
- **Why single call, not N parallel:** see decisions.md 2026-04-20 Day-3. Cost + latency + complexity wins outweigh the theoretical fault-isolation benefit of parallel calls.
- **Why JSON-only, no prose:** same parser strategy as Flow A — naive `JSON.parse` with `{...}` regex fallback. Any prose breaks the parse.
- **Why Depop hashtags as an array, not inline in description:** lets the UI render a tappable hashtag chip row separate from the description card, which is what Depop sellers actually want to review before copying. The prompt also duplicates the hashtags at the end of `description` as a formatted block, so "Copy everything" still produces a paste-ready description.
- **Why no vision:** Flow A already identified the item. Re-sending the image would cost image-tokens for no accuracy gain. If we want Flow B to enrich material + fit by looking at the photo again, that's a v0.2 bump where the image comes in alongside the structured input.
- **Why Sonnet 4.6 over Opus 4.7:** text-only task; ~40% cheaper ($3/$15 vs $5/$25 per MTok `[verified 2026-04-20]`); latency win helps the <20s end-to-end Flow B bar. Swap is one line if Day-3 verification shows materially worse copy quality.

### Partial-failure handling

The service (`claudeListingService.ts`) uses defensive parsing. If the model returns a well-formed top-level JSON object but one platform sub-object is malformed, the service returns the platforms that parsed plus a `partialErrors` array listing the platform keys that failed. The Listing screen renders a per-tab retry affordance ("Couldn't generate — tap to retry") for failed platforms.

### v0.1 benchmark results

Day-3 Phase 5 verification TBD. Once run, paste latency p50/p95 + parse-success rate + title-cap compliance summary here under a "Benchmark results" sub-heading.

---

## Versioning rules

- Bump to a new top-level version heading when the schema changes (fields added / removed / renamed).
- Bump a minor suffix (`v0.2.1`) for copy tweaks that don't change the schema.
- Never mutate a shipped prompt in place — the diff against accuracy results is how we learn.
- On every bump, re-run `npm run benchmark -- --only anthropic` against the 20-item set. Paste the accuracy + latency summary into the doc under a "Benchmark results" sub-heading for that version.
