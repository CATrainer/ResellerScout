/**
 * scripts/test-ebay.ts
 *
 * Day 1 proof: prove we can hit eBay Finding API against the UK marketplace and pull sold-listing
 * comps for a real clothing query. Also writes docs/ebay-api-notes.md with observed latency + shape.
 *
 * Run (after putting keys in .env):
 *   npm run test-ebay
 *   npm run test-ebay -- "Primark size 12 skirt"
 *   npm run test-ebay -- --query "Next blazer size 10" --limit 20
 */

import 'dotenv/config';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { searchSoldListings, suggestPriceFromComps } from '../src/services/ebayService';

interface CliArgs {
  query: string;
  limit: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let query = 'Next size 10 dress';
  let limit = 15;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query' || a === '-q') query = argv[++i] ?? query;
    else if (a === '--limit' || a === '-l') limit = Number(argv[++i]) || limit;
    else if (!a.startsWith('--') && i === 0) query = a; // positional first arg
  }
  return { query, limit };
}

async function main() {
  const { query, limit } = parseArgs();
  console.log(`\n> eBay Finding API — UK sold listings`);
  console.log(`> Query: "${query}"  Marketplace: EBAY-GB  Limit: ${limit}\n`);

  const result = await searchSoldListings(query, { marketplace: 'EBAY-GB', limit });

  console.log(`Total entries available:  ${result.totalEntries}`);
  console.log(`Returned listings:        ${result.listings.length}`);
  console.log(`API latency:              ${result.rawResponseSummary.elapsedMs} ms`);
  console.log(`ack:                      ${result.rawResponseSummary.ack}`);
  console.log(`eBay server timestamp:    ${result.rawResponseSummary.timestamp}\n`);

  console.log('First 5 listings:');
  for (const l of result.listings.slice(0, 5)) {
    console.log(
      `  • £${l.priceGbp.toFixed(2)}  ${l.conditionDisplayName ?? 'Unknown'}  ` +
        `${l.soldDate.toISOString().slice(0, 10)}  ${l.title.slice(0, 80)}`,
    );
  }

  const suggestion = suggestPriceFromComps(result.listings);
  if (suggestion) {
    console.log(
      `\nSuggested Vinted price (median): £${suggestion.suggestedGbp.toFixed(2)}  ` +
        `[IQR £${suggestion.lowGbp.toFixed(2)} – £${suggestion.highGbp.toFixed(2)}, n=${suggestion.n}]`,
    );
  }

  // Write observed behaviour to docs/ebay-api-notes.md — overwrite each run with latest.
  const notesPath = join(__dirname, '..', 'docs', 'ebay-api-notes.md');
  if (!existsSync(dirname(notesPath))) mkdirSync(dirname(notesPath), { recursive: true });
  const notes = `# eBay Finding API — Observed Behaviour

Last run: ${new Date().toISOString()} — query: \`${query}\` on EBAY-GB.

## Observed
- Operation: \`findCompletedItems\` (v1.13.0)
- Endpoint: \`svcs.ebay.com/services/search/FindingService/v1\` (production)
- Auth: App ID only (query param \`SECURITY-APPNAME\`) — no OAuth required.
- Latency for this query: **${result.rawResponseSummary.elapsedMs} ms**
- Total matches in eBay's index for this query: ${result.totalEntries}
- Returned: ${result.listings.length}
- ack: \`${result.rawResponseSummary.ack}\`

## Rate limits (documented — verify in developer dashboard)
- Default App ID tier: ~5,000 calls/day, ~100/min burst.
- Upgrade path: Commercial tier via "Compatible Application Check" or a production release request.

## Response shape
\`\`\`
findCompletedItemsResponse[0]
├── ack[0]                         "Success" | "Failure" | "PartialFailure"
├── timestamp[0]                   ISO string
├── searchResult[0]
│   └── item[]                     array of listings
│       ├── itemId[0]
│       ├── title[0]
│       ├── sellingStatus[0].currentPrice[0].__value__  (number as string)
│       ├── sellingStatus[0].currentPrice[0]['@currencyId']  "GBP" on EBAY-GB
│       ├── listingInfo[0].endTime[0]                  ISO — this is the sold date
│       ├── condition[0].conditionDisplayName[0]       "Used" | "New" etc.
│       ├── galleryURL[0]
│       ├── viewItemURL[0]
│       └── primaryCategory[0].categoryName[0]
├── paginationOutput[0].totalEntries[0]
└── errorMessage[0].error[]        present only on ack != Success
\`\`\`

## Gotchas discovered
- (to be filled as we hit them)

## Next steps before Day 5
- Wrap behind Supabase Edge Function proxy so App ID never ships in client bundle.
- Add short-term cache (Supabase or in-memory) keyed on query — same scan run twice shouldn't burn 2 calls.
- Cache hit-rate target: >60% by Week 2.
`;
  writeFileSync(notesPath, notes, 'utf-8');
  console.log(`\nWrote ${notesPath}\n`);
}

main().catch(err => {
  console.error('\nFAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
