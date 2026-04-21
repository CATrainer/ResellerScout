# WorthIt

Mobile app for UK resellers: **scan an item → identify it → price it → list it on Vinted in 60 seconds.**

Previously codenamed *Reseller Scout* (renamed 2026-04-20 after name clearance — see `heuricity-hq/personal/app-machine/decisions.md`).

- Product spec: `heuricity-hq/personal/app-machine/design/worthit.md`
- Strategy / positioning: `heuricity-hq/personal/app-machine/plan-v4.md`
- Task board: `heuricity-hq/personal/app-machine/tasks.md`
- Build learnings: `heuricity-hq/../Repos/app-machine/build-playbook.md`

## Status

**Day 1 — 20 Apr 2026.** Scaffold + Day-2 pivot prepped.

| Area | State |
|---|---|
| Expo TS app scaffolded | ✅ |
| eBay Finding API service | ⚠️ Deprecated Day 1 (Finding API decommissioned Feb 2025) |
| Vinted comps service (ScrapingBee vs Apify benchmark) | Day 2 morning |
| Vision-model benchmark harness | ✅ (Anthropic-only for v1 per Caleb's Day 1 decision) |
| Core loop UI | Day 2 afternoon |
| Listing generator | Day 4 |
| RevenueCat paywall | Day 5 |
| App Store submission | Day 6 (Sat 25 Apr) |

## Getting started (first time, on your dev machine)

```bash
# Install
npm install

# Environment
cp .env.example .env
# Then fill in:
#   ANTHROPIC_API_KEY (vision)
#   SCRAPINGBEE_API_KEY + APIFY_API_TOKEN (Vinted comps — Day 2 benchmark picks the winner)

# Run the app
npx expo start
# Scan the QR code with the Expo Go app on your iPhone.
```

## Scripts

```bash
# Vision-model benchmark (after 20 items land in scripts/benchmark-items/)
npm run benchmark
npm run benchmark -- --only claude --items 5

# Day 2: Vinted comps provider benchmark (ScrapingBee vs Apify) — script added Day 2 morning
npm run test-comps
```

## Project structure

```
App.tsx                            # Day-1 placeholder; Day-2 replaces with camera screen
app.json                           # Expo config — camera + photo permissions, bundle id
src/
  config/env.ts                    # Env-var accessor (Node-only + app-bundle distinctions)
  services/
    ebayService.ts                 # DEPRECATED 2026-04-20 (Finding API decommissioned)
    vintedCompsService.ts          # Day 2 — scraped Vinted UK sold comps + IQR price heuristic
  state/                           # Zustand stores (Day 2+)
  screens/                         # Scan / Loading / Reveal / Listing (Day 2+)
  components/                      # Shared UI (Day 2+)
scripts/
  benchmark-vision.ts              # Vision model choice (Anthropic-only for v1)
  benchmark-items/                 # (gitignored) 20 test items + truth files
docs/
  model-benchmark.md               # Auto-updated by benchmark-vision
  comps-provider-benchmark.md      # Day 2 — auto-updated by the comps benchmark
```

## Stack

- **Expo 54 / React Native / TypeScript** (per 2026-04-09 decision — matches CLUTCH knowledge, EAS cloud builds, no Mac required)
- **expo-camera** for scanning
- **@supabase/supabase-js** for auth + item storage (Day 2+)
- **react-native-purchases** (RevenueCat) for subscriptions (Day 5)
- **zustand** for state

## Metric bars before App Store submission

From `plan-v4.md` — submit only when all green:

| Metric | Bar |
|---|---|
| Item ID accuracy | ≥ 90% |
| Scan → price reveal latency | < 3 s |
| Install → first scan | ≥ 40% |
| Scan → listing completion | ≥ 15% |
| Trial → paid (post-traffic) | ≥ 4% |
| D1 retention | ≥ 30% |
| D7 retention | ≥ 15% |
