# Reseller Scout

Mobile app for UK resellers: **scan an item → identify it → price it → list it on Vinted in 60 seconds.**

- Product spec: `heuricity-hq/personal/app-machine/design/reseller-scout.md`
- Strategy / positioning: `heuricity-hq/personal/app-machine/plan-v4.md`
- Task board: `heuricity-hq/personal/app-machine/tasks.md`
- Build learnings: `heuricity-hq/../Repos/app-machine/build-playbook.md`

## Status

**Day 1 — 20 Apr 2026.** Scaffold only. No UI yet.

| Area | State |
|---|---|
| Expo TS app scaffolded | ✅ |
| eBay Finding API service + test script | ✅ (needs `.env` keys) |
| Vision-model benchmark harness | ✅ (needs 20 items in `scripts/benchmark-items/`) |
| Core loop UI | Day 2 |
| Listing generator | Day 4 |
| RevenueCat paywall | Day 5 |
| App Store submission | Day 6 (Sat 25 Apr) |

## Getting started (first time, on your dev machine)

```bash
# Install
npm install

# Environment
cp .env.example .env
# Then fill in eBay keys (prod), OpenAI key, Replicate token. See .env.example for where to get each.

# Run the app
npx expo start
# Scan the QR code with the Expo Go app on your iPhone.
```

## Scripts

```bash
# Prove the eBay Finding API works against UK marketplace
npm run test-ebay                         # default query: "Next size 10 dress"
npm run test-ebay -- "Primark size 12 skirt"

# Run the vision-model benchmark (after 20 items are in scripts/benchmark-items/)
npm run benchmark
npm run benchmark -- --only gpt --items 5
```

## Project structure

```
App.tsx                            # Day-1 placeholder; Day-2 replaces with camera screen
app.json                           # Expo config — camera + photo permissions, bundle id
src/
  config/env.ts                    # Env-var accessor (Node-only + app-bundle distinctions)
  services/
    ebayService.ts                 # Finding API client + price-suggestion heuristic
  state/                           # Zustand stores (Day 2+)
  screens/                         # Scan / Loading / Reveal / Listing (Day 2+)
  components/                      # Shared UI (Day 2+)
scripts/
  test-ebay.ts                     # Day-1 proof script, writes docs/ebay-api-notes.md
  benchmark-vision.ts              # Day-2 model-choice decider
  benchmark-items/                 # (gitignored) fiancée's 20 test items + truth files
docs/
  ebay-api-notes.md                # Auto-updated by test-ebay
  model-benchmark.md               # Auto-updated by benchmark-vision
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
