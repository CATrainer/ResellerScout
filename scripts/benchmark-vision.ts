/**
 * scripts/benchmark-vision.ts
 *
 * Day 2 deliverable. 3-way head-to-head on 20 real UK clothing items fiancée photographs.
 *
 * CANDIDATES (April 2026 frontier — verified via web search 2026-04-20):
 *   - Claude Opus 4.7           (Anthropic, released 16 Apr 2026 — visual-acuity 98.5%)
 *   - GPT-5.4                   (OpenAI, released March 2026 — 81.2% MMMU-Pro, 10M-px native)
 *   - Gemini 3.1 Pro            (Google, April 2026 — 81% MMMU-Pro, leads multimodal)
 *
 * Replicate/FLUX.2 Pro dropped: FLUX is text-to-image generation, not vision understanding.
 * See ../heuricity-hq/personal/app-machine/decisions.md entry of 2026-04-20.
 *
 * Model IDs are driven by env vars so you can re-point to tier-2 siblings for a second pass:
 *   ANTHROPIC_VISION_MODEL   default: claude-opus-4-7              (tier-2: claude-sonnet-4-6)
 *   OPENAI_VISION_MODEL      default: gpt-5.4                      (tier-2: gpt-5.4-mini)
 *   GOOGLE_VISION_MODEL      default: gemini-3.1-pro               (tier-2: gemini-3-flash)
 *
 * Input layout:
 *   scripts/benchmark-items/
 *     item-01.jpg             ← photo (phone camera, natural light, whole item visible)
 *     item-01.truth.json      ← ground truth — see schema in scripts/benchmark-items/README.md
 *     ... up to item-20
 *
 * Run:
 *   npm run benchmark                      # all items, all 3 models
 *   npm run benchmark -- --only anthropic  # one model
 *   npm run benchmark -- --items 5         # first 5 items (smoke test, cheap)
 *
 * Output:
 *   - docs/model-benchmark.md                        (human-readable summary, overwritten each run)
 *   - docs/model-benchmark-results-YYYY-MM-DD.json   (raw results, gitignored)
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { nodeEnv } from '../src/config/env';

type ModelKey = 'anthropic' | 'openai' | 'google';

// -- Locked prompt v0.1. If we tweak between runs, note the diff in the markdown output.
const PROMPT_V01 = `You are an expert UK second-hand reseller identifying an item for listing on Vinted.

Look at the photo and return ONLY a compact JSON object with these keys:
{
  "brand": "...",          // brand name exactly as it appears on the label (e.g. "Next", "Primark", "M&S", "Uniqlo")
  "category": "...",       // one of: dress, top, t-shirt, skirt, trousers, jeans, jacket, coat, shoes, handbag, other
  "size": "...",           // UK size (e.g. "10", "M", "40" for shoes) or "unknown"
  "color": "...",          // dominant color, single word (e.g. "navy", "cream", "olive")
  "confidence": 0.0        // 0.0-1.0, your own confidence that brand + category + size are correct
}

If a field is genuinely unreadable, use "unknown". Do not guess. Return JSON and nothing else.`;

interface TruthFile {
  brand: string;
  category: string;
  size?: string;
  color?: string;
  conditionSelfRated?: string;
}

interface ModelResult {
  model: ModelKey;
  modelVersion: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  confidence: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
}

interface ItemResult {
  itemId: string;
  truth: TruthFile;
  results: ModelResult[];
}

interface CliArgs {
  only: ModelKey | 'all';
  items: number; // 0 = all
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let only: CliArgs['only'] = 'all';
  let items = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') only = (argv[++i] as CliArgs['only']) ?? 'all';
    else if (argv[i] === '--items') items = Number(argv[++i]) || 0;
  }
  return { only, items };
}

function loadItems(): { id: string; imagePath: string; truth: TruthFile }[] {
  const dir = join(__dirname, 'benchmark-items');
  if (!existsSync(dir)) {
    throw new Error(
      `benchmark-items/ directory not found at ${dir}. See scripts/benchmark-items/README.md.`,
    );
  }
  const files = readdirSync(dir);
  const imageExts = ['.jpg', '.jpeg', '.png', '.heic'];
  const images = files.filter(f => imageExts.some(ext => f.toLowerCase().endsWith(ext)));
  const items = images.map(img => {
    const id = basename(img).replace(/\.(jpg|jpeg|png|heic)$/i, '');
    const truthFile = join(dir, `${id}.truth.json`);
    if (!existsSync(truthFile)) {
      throw new Error(`Missing truth file for ${id} at ${truthFile}`);
    }
    const truth = JSON.parse(readFileSync(truthFile, 'utf-8')) as TruthFile;
    return { id, imagePath: join(dir, img), truth };
  });
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function imageToBase64Parts(imagePath: string): { b64: string; mime: string } {
  const lower = imagePath.toLowerCase();
  const mime = lower.endsWith('.png') ? 'image/png'
             : lower.endsWith('.heic') ? 'image/heic'
             : 'image/jpeg';
  return { b64: readFileSync(imagePath).toString('base64'), mime };
}

function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract the first {...} block
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return {};
  }
}

// ----- Anthropic -----
async function callAnthropic(imagePath: string): Promise<ModelResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResult('anthropic', 'claude-opus-4-7', 0, 'ANTHROPIC_API_KEY missing');
  }
  const modelVersion = process.env.ANTHROPIC_VISION_MODEL ?? 'claude-opus-4-7';
  const { b64, mime } = imageToBase64Parts(imagePath);

  const started = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelVersion,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } },
            { type: 'text', text: PROMPT_V01 },
          ],
        },
      ],
    }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return errorResult('anthropic', modelVersion, latencyMs, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const content = body.content?.[0]?.text ?? '{}';
  const parsed = safeJsonParse(content);

  // Cost (Claude Opus 4.7): $5/MTok input, $25/MTok output [verified 2026-04-20 — Anthropic pricing page].
  // Image input ~1500 tokens for a typical phone photo; output ~60 tokens.
  const inputTokens = body.usage?.input_tokens ?? 1500;
  const outputTokens = body.usage?.output_tokens ?? 60;
  const costUsd =
    (inputTokens / 1_000_000) * 5 + (outputTokens / 1_000_000) * 25;

  return {
    model: 'anthropic',
    modelVersion,
    brand: String(parsed.brand ?? 'unknown'),
    category: String(parsed.category ?? 'unknown'),
    size: String(parsed.size ?? 'unknown'),
    color: String(parsed.color ?? 'unknown'),
    confidence: Number(parsed.confidence ?? 0),
    latencyMs,
    costUsd,
  };
}

// ----- OpenAI -----
async function callOpenAI(imagePath: string): Promise<ModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return errorResult('openai', 'gpt-5.4', 0, 'OPENAI_API_KEY missing');
  }
  const modelVersion = process.env.OPENAI_VISION_MODEL ?? 'gpt-5.4';
  const { b64, mime } = imageToBase64Parts(imagePath);

  const started = Date.now();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelVersion,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT_V01 },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 300,
    }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return errorResult('openai', modelVersion, latencyMs, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const content = body.choices?.[0]?.message?.content ?? '{}';
  const parsed = safeJsonParse(content);

  // Cost (GPT-5.4 tier, as of Apr 2026 — verify at openai.com/pricing): ~$2.50/MTok input, ~$10/MTok output.
  const inputTokens = body.usage?.prompt_tokens ?? 1500;
  const outputTokens = body.usage?.completion_tokens ?? 60;
  const costUsd =
    (inputTokens / 1_000_000) * 2.5 + (outputTokens / 1_000_000) * 10;

  return {
    model: 'openai',
    modelVersion,
    brand: String(parsed.brand ?? 'unknown'),
    category: String(parsed.category ?? 'unknown'),
    size: String(parsed.size ?? 'unknown'),
    color: String(parsed.color ?? 'unknown'),
    confidence: Number(parsed.confidence ?? 0),
    latencyMs,
    costUsd,
  };
}

// ----- Google Gemini -----
async function callGoogle(imagePath: string): Promise<ModelResult> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return errorResult('google', 'gemini-3.1-pro', 0, 'GOOGLE_AI_API_KEY missing');
  }
  const modelVersion = process.env.GOOGLE_VISION_MODEL ?? 'gemini-3.1-pro';
  const { b64, mime } = imageToBase64Parts(imagePath);

  const started = Date.now();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: mime, data: b64 } },
              { text: PROMPT_V01 },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 300,
        },
      }),
    },
  );
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return errorResult('google', modelVersion, latencyMs, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  const content = body.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const parsed = safeJsonParse(content);

  // Cost (Gemini 3.1 Pro, as of Apr 2026 — verify at ai.google.dev/pricing): ~$1.25/MTok input, ~$5/MTok output.
  const inputTokens = body.usageMetadata?.promptTokenCount ?? 1500;
  const outputTokens = body.usageMetadata?.candidatesTokenCount ?? 60;
  const costUsd =
    (inputTokens / 1_000_000) * 1.25 + (outputTokens / 1_000_000) * 5;

  return {
    model: 'google',
    modelVersion,
    brand: String(parsed.brand ?? 'unknown'),
    category: String(parsed.category ?? 'unknown'),
    size: String(parsed.size ?? 'unknown'),
    color: String(parsed.color ?? 'unknown'),
    confidence: Number(parsed.confidence ?? 0),
    latencyMs,
    costUsd,
  };
}

function errorResult(model: ModelKey, modelVersion: string, latencyMs: number, error: string): ModelResult {
  return {
    model, modelVersion,
    brand: '', category: '', size: '', color: '', confidence: 0,
    latencyMs, costUsd: 0, error,
  };
}

function scoreMatch(truth: TruthFile, result: ModelResult): { brand: boolean; category: boolean; size: boolean } {
  const norm = (s: string) => s.toLowerCase().trim();
  return {
    brand: norm(truth.brand) === norm(result.brand),
    category: norm(truth.category) === norm(result.category),
    size: truth.size ? norm(truth.size) === norm(result.size) : true,
  };
}

function writeMarkdown(results: ItemResult[], outPath: string) {
  const modelKeys: ModelKey[] = ['anthropic', 'openai', 'google'];
  const displayName: Record<ModelKey, string> = {
    anthropic: 'Claude Opus 4.7',
    openai: 'GPT-5.4',
    google: 'Gemini 3.1 Pro',
  };
  const acc = (model: ModelKey) => {
    const matches = results.map(r => {
      const res = r.results.find(x => x.model === model);
      return res && !res.error ? scoreMatch(r.truth, res) : null;
    }).filter(Boolean) as Array<ReturnType<typeof scoreMatch>>;
    if (!matches.length) return { brand: 0, category: 0, size: 0, n: 0 };
    return {
      brand: matches.filter(m => m.brand).length / matches.length,
      category: matches.filter(m => m.category).length / matches.length,
      size: matches.filter(m => m.size).length / matches.length,
      n: matches.length,
    };
  };
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const metricBar = 0.9;

  const rows = modelKeys.map(m => {
    const a = acc(m);
    const runs = results.flatMap(r => r.results.filter(x => x.model === m && !x.error));
    const passes = a.brand >= metricBar && a.category >= metricBar;
    return {
      model: m,
      version: runs[0]?.modelVersion ?? displayName[m],
      brandAcc: a.brand,
      catAcc: a.category,
      sizeAcc: a.size,
      n: a.n,
      avgLatency: avg(runs.map(r => r.latencyMs)),
      avgCost: avg(runs.map(r => r.costUsd)),
      passes,
    };
  });

  const md = `# Vision Model Benchmark — WorthIt

Run: ${new Date().toISOString()}
Prompt version: v0.1
Items: ${results.length}

## Metric-bar check (plan-v4 requires ≥ 90% brand + category accuracy)

| Model | Version | Brand | Category | Size | Avg latency | Avg cost / scan | Passes bar? |
|-------|---------|-------|----------|------|-------------|-----------------|-------------|
${rows.map(r => `| ${displayName[r.model]} | \`${r.version}\` | ${(r.brandAcc * 100).toFixed(0)}% | ${(r.catAcc * 100).toFixed(0)}% | ${(r.sizeAcc * 100).toFixed(0)}% | ${r.avgLatency.toFixed(0)} ms | $${r.avgCost.toFixed(4)} | ${r.passes ? '✅' : '❌'} |`).join('\n')}

## Per-item results

| Item | Truth (brand / cat / size) | Claude | GPT-5.4 | Gemini 3.1 |
|------|----------------------------|--------|---------|------------|
${results.map(r => {
  const cell = (m: ModelKey) => {
    const res = r.results.find(x => x.model === m);
    if (!res) return '—';
    if (res.error) return `ERR: ${res.error.slice(0, 40)}`;
    const s = scoreMatch(r.truth, res);
    const marks = `b${s.brand ? '✓' : '✗'} c${s.category ? '✓' : '✗'} s${s.size ? '✓' : '✗'}`;
    return `${res.brand} / ${res.category} / ${res.size} (${marks})`;
  };
  return `| ${r.itemId} | ${r.truth.brand} / ${r.truth.category} / ${r.truth.size ?? '—'} | ${cell('anthropic')} | ${cell('openai')} | ${cell('google')} |`;
}).join('\n')}

## Decision rule

Ship the tier-1 model that (a) passes 90% on **brand AND category** and (b) has lowest cost×latency product.

Then re-run this benchmark swapping to the tier-2 sibling (\`ANTHROPIC_VISION_MODEL=claude-sonnet-4-6\`, \`OPENAI_VISION_MODEL=gpt-5.4-mini\`, \`GOOGLE_VISION_MODEL=gemini-3-flash\`). If tier-2 still passes, ship tier-2 for margin. Use tier-1 as fallback for low-confidence scans only.

## If nothing passes 90%

1. Re-check truth data — are label-readings accurate?
2. Iterate prompt to v0.2 (add category examples + UK brand glossary).
3. Re-benchmark with v0.2.
4. If still < 90%: add barcode scan fallback for branded items (per \`tasks.md\` blocked-list).
5. If still < 90%: escalate to full strategy review (Caleb ⇄ Claude, not "add a feature and hope").
`;
  writeFileSync(outPath, md, 'utf-8');
}

async function main() {
  const args = parseArgs();
  const all = loadItems();
  const items = args.items > 0 ? all.slice(0, args.items) : all;

  if (!items.length) {
    console.log('No items found. See scripts/benchmark-items/README.md for how to add them.');
    process.exit(0);
  }

  const modelsToRun: ModelKey[] =
    args.only === 'all' ? ['anthropic', 'openai', 'google'] : [args.only];
  console.log(
    `\nBenchmarking ${items.length} items across ${modelsToRun.map(m => m.toUpperCase()).join(' + ')}...\n`,
  );

  const results: ItemResult[] = [];
  for (const it of items) {
    process.stdout.write(`- ${it.id}  `);
    const runs: ModelResult[] = [];
    for (const m of modelsToRun) {
      try {
        const caller = m === 'anthropic' ? callAnthropic
                     : m === 'openai' ? callOpenAI
                     : callGoogle;
        const r = await caller(it.imagePath);
        process.stdout.write(`${m} ${r.error ? '✗' : '✓'}(${r.latencyMs}ms)  `);
        runs.push(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        process.stdout.write(`${m} ✗(${msg.slice(0, 30)})  `);
        runs.push(errorResult(m, '?', 0, msg));
      }
    }
    process.stdout.write('\n');
    results.push({ itemId: it.id, truth: it.truth, results: runs });
  }

  // Write outputs
  const docsDir = join(__dirname, '..', 'docs');
  if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
  writeMarkdown(results, join(docsDir, 'model-benchmark.md'));
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(docsDir, `model-benchmark-results-${today}.json`),
    JSON.stringify(results, null, 2),
    'utf-8',
  );

  console.log(`\nWrote docs/model-benchmark.md and docs/model-benchmark-results-${today}.json\n`);
}

main().catch(err => {
  console.error('\nFAILED:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
