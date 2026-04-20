/**
 * scripts/benchmark-vision.ts
 *
 * Day 2 deliverable. Runs head-to-head: GPT-Image-1.5 (OpenAI) vs FLUX.2 Pro (Replicate) on
 * the 20 real UK clothing items fiancée photographs. Output is the single data point that
 * decides which model ships in v1.
 *
 * Input layout:
 *   scripts/benchmark-items/
 *     item-01.jpg             ← photo (any modern camera — no special lighting required)
 *     item-01.truth.json      ← ground truth — see schema below
 *     item-02.jpg / .truth.json
 *     ... up to item-20
 *
 * Ground-truth schema (item-XX.truth.json):
 *   {
 *     "brand": "Next",
 *     "category": "dress",
 *     "size": "10",
 *     "color": "navy",
 *     "conditionSelfRated": "good" | "excellent" | "new"
 *   }
 *
 * Run:
 *   npm run benchmark                  # all items, both models
 *   npm run benchmark -- --only gpt    # GPT only
 *   npm run benchmark -- --only flux   # FLUX only
 *   npm run benchmark -- --items 5     # first 5 only (quick smoke)
 *
 * Output:
 *   - docs/model-benchmark.md           ← human-readable summary (overwritten each run)
 *   - docs/model-benchmark-results-YYYY-MM-DD.json   ← raw results (gitignored)
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { nodeEnv } from '../src/config/env';

// -- Locked prompt. If we tweak this between runs, note it in the diff column of the markdown output.
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
  model: 'gpt-image-1.5' | 'flux-2-pro';
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
  only: 'gpt' | 'flux' | 'both';
  items: number; // 0 = all
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let only: CliArgs['only'] = 'both';
  let items = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') only = (argv[++i] as CliArgs['only']) ?? 'both';
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

async function callGpt(imagePath: string): Promise<ModelResult> {
  const apiKey = nodeEnv.openaiApiKey();
  const imageB64 = readFileSync(imagePath).toString('base64');
  const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const started = Date.now();
  // gpt-image-1.5 is the 2026 model name assumed in plan-v4. If OpenAI ships a different name
  // (e.g. gpt-5-mini-vision) this is the single line to change.
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL ?? 'gpt-image-1.5',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT_V01 },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${imageB64}` } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return {
      model: 'gpt-image-1.5',
      brand: '', category: '', size: '', color: '', confidence: 0,
      latencyMs, costUsd: 0,
      error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  const body = await res.json();
  const content = body.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content);

  // Cost estimate — adjust when OpenAI publishes 2026 pricing. Current assumption: ~$0.005/image
  // for vision + input/output tokens combined.
  const usage = body.usage;
  const costUsd = usage
    ? (usage.prompt_tokens / 1000) * 0.0025 + (usage.completion_tokens / 1000) * 0.01 + 0.002
    : 0.005;

  return {
    model: 'gpt-image-1.5',
    brand: String(parsed.brand ?? 'unknown'),
    category: String(parsed.category ?? 'unknown'),
    size: String(parsed.size ?? 'unknown'),
    color: String(parsed.color ?? 'unknown'),
    confidence: Number(parsed.confidence ?? 0),
    latencyMs,
    costUsd,
  };
}

async function callFlux(imagePath: string): Promise<ModelResult> {
  const token = nodeEnv.replicateApiToken();
  const imageB64 = readFileSync(imagePath).toString('base64');
  const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

  const started = Date.now();
  // NOTE: FLUX.2 Pro is a text-to-image model. For vision/identification we actually need a
  // vision-capable Replicate model (e.g. black-forest-labs/flux-kontext-pro for reasoning
  // over images, or Anthropic Claude Vision via Replicate proxy, or yi-vl-34b).
  // Replace REPLICATE_VISION_MODEL with whichever wins competitor due-diligence Day 2 morning.
  // Default here uses a placeholder — will be locked once we confirm Replicate's 2026 vision lineup.
  const modelVersion = process.env.REPLICATE_VISION_MODEL ?? 'yorickvp/llava-13b:latest';

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Prefer: 'wait=60',
    },
    body: JSON.stringify({
      version: modelVersion,
      input: {
        image: `data:${mime};base64,${imageB64}`,
        prompt: PROMPT_V01,
      },
    }),
  });
  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return {
      model: 'flux-2-pro',
      brand: '', category: '', size: '', color: '', confidence: 0,
      latencyMs, costUsd: 0,
      error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
    };
  }
  const body = await res.json();
  const output = Array.isArray(body.output) ? body.output.join('') : body.output ?? '';
  let parsed: any = {};
  try {
    const match = String(output).match(/\{[\s\S]*\}/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    // leave parsed empty; error surfaced in accuracy comparison
  }

  // Replicate cost: varies by model. Placeholder — refine once model is locked.
  const costUsd = 0.008;

  return {
    model: 'flux-2-pro',
    brand: String(parsed.brand ?? 'unknown'),
    category: String(parsed.category ?? 'unknown'),
    size: String(parsed.size ?? 'unknown'),
    color: String(parsed.color ?? 'unknown'),
    confidence: Number(parsed.confidence ?? 0),
    latencyMs,
    costUsd,
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
  const gpt = results.flatMap(r => r.results.filter(x => x.model === 'gpt-image-1.5'));
  const flux = results.flatMap(r => r.results.filter(x => x.model === 'flux-2-pro'));
  const acc = (model: 'gpt-image-1.5' | 'flux-2-pro') => {
    const matches = results.map(r => {
      const res = r.results.find(x => x.model === model);
      return res ? scoreMatch(r.truth, res) : null;
    }).filter(Boolean) as Array<ReturnType<typeof scoreMatch>>;
    if (!matches.length) return { brand: 0, category: 0, size: 0 };
    return {
      brand: matches.filter(m => m.brand).length / matches.length,
      category: matches.filter(m => m.category).length / matches.length,
      size: matches.filter(m => m.size).length / matches.length,
    };
  };
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const gptAcc = acc('gpt-image-1.5');
  const fluxAcc = acc('flux-2-pro');
  const metricBar = 0.9;

  const md = `# Vision Model Benchmark — Reseller Scout

Run: ${new Date().toISOString()}
Prompt version: v0.1
Items: ${results.length}

## Metric-bar check (plan-v4 requires ≥ 90%)

| Model          | Brand acc | Category acc | Size acc | Avg latency | Avg cost | Passes bar? |
|----------------|-----------|--------------|----------|-------------|----------|-------------|
| GPT-Image-1.5  | ${(gptAcc.brand * 100).toFixed(0)}%      | ${(gptAcc.category * 100).toFixed(0)}%         | ${(gptAcc.size * 100).toFixed(0)}%     | ${avg(gpt.map(r => r.latencyMs)).toFixed(0)} ms    | $${avg(gpt.map(r => r.costUsd)).toFixed(4)}  | ${gptAcc.brand >= metricBar && gptAcc.category >= metricBar ? '✅' : '❌'}           |
| FLUX.2 Pro     | ${(fluxAcc.brand * 100).toFixed(0)}%      | ${(fluxAcc.category * 100).toFixed(0)}%         | ${(fluxAcc.size * 100).toFixed(0)}%     | ${avg(flux.map(r => r.latencyMs)).toFixed(0)} ms    | $${avg(flux.map(r => r.costUsd)).toFixed(4)}  | ${fluxAcc.brand >= metricBar && fluxAcc.category >= metricBar ? '✅' : '❌'}           |

## Per-item results

| Item | Truth (brand / cat / size) | GPT result | GPT match | FLUX result | FLUX match |
|------|----------------------------|------------|-----------|-------------|------------|
${results.map(r => {
  const g = r.results.find(x => x.model === 'gpt-image-1.5');
  const f = r.results.find(x => x.model === 'flux-2-pro');
  const gMatch = g ? scoreMatch(r.truth, g) : null;
  const fMatch = f ? scoreMatch(r.truth, f) : null;
  const asStr = (res: ModelResult | undefined) => res ? `${res.brand} / ${res.category} / ${res.size}` : '—';
  const matchStr = (m: ReturnType<typeof scoreMatch> | null) => m ? `b${m.brand ? '✓' : '✗'} c${m.category ? '✓' : '✗'} s${m.size ? '✓' : '✗'}` : '—';
  return `| ${r.itemId} | ${r.truth.brand} / ${r.truth.category} / ${r.truth.size ?? '—'} | ${asStr(g)} | ${matchStr(gMatch)} | ${asStr(f)} | ${matchStr(fMatch)} |`;
}).join('\n')}

## Decision

Decision rule: ship the model that passes the 90% bar on **brand AND category** with lower latency.
If neither passes: iterate on prompt (v0.2 with category examples), then consider barcode-scan fallback
for branded items (per tasks.md blocked-list fallback).
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

  console.log(`\nBenchmarking ${items.length} items across ${args.only === 'both' ? 'GPT + FLUX' : args.only.toUpperCase()}...\n`);

  const results: ItemResult[] = [];
  for (const it of items) {
    process.stdout.write(`- ${it.id}  `);
    const runs: ModelResult[] = [];
    if (args.only !== 'flux') {
      try {
        const r = await callGpt(it.imagePath);
        process.stdout.write(`GPT ${r.error ? '✗' : '✓'}(${r.latencyMs}ms)  `);
        runs.push(r);
      } catch (e) {
        process.stdout.write('GPT ✗  ');
      }
    }
    if (args.only !== 'gpt') {
      try {
        const r = await callFlux(it.imagePath);
        process.stdout.write(`FLUX ${r.error ? '✗' : '✓'}(${r.latencyMs}ms)`);
        runs.push(r);
      } catch (e) {
        process.stdout.write('FLUX ✗');
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
