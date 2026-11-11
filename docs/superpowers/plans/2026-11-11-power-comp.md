# Power Comp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline single-file browser app that loads a smart-trainer FIT file and a power-meter FIT file, aligns them in time, and reports how much they disagree plus warnings about unusual readings.

**Architecture:** Pure TypeScript pipeline in `src/lib/` (parse → resample → align → overlap → smooth → stats/anomalies), each module unit-tested with Vitest; a thin `pipeline.ts` composes it. Svelte 5 components render the result; uPlot draws three synced charts. Vite + `vite-plugin-singlefile` builds one self-contained `dist/index.html`.

**Tech Stack:** Svelte 5, Vite 8, TypeScript 6, Vitest 5, `@garmin/fitsdk` ^21.221.0, `uplot` ^1.6.32, `vite-plugin-singlefile` ^2.3.3.

**Spec:** `docs/superpowers/specs/2026-11-11-power-comp-design.md`

## Global Constraints

- All processing in the browser; no network requests at runtime; `dist/index.html` must work opened via `file://` with no internet.
- UI copy in English.
- Project layout, scripts and config mirror `/Users/carrot/omega-calc` (package.json scripts `dev`, `build`, `preview`, `test`, `test:watch`, `check`; same `vite.config.ts`, `svelte.config.js`, `tsconfig.json` shape).
- All thresholds live in `src/lib/settings.ts` `DEFAULT_SETTINGS`; no magic numbers for spec thresholds elsewhere.
- Lag convention: `lagSec` is added to the meter's absolute timestamps; meter sample at absolute T is compared with trainer sample at T + lagSec. 0 = trust timestamps.
- Time positions everywhere (overlap, extremes, anomalies, chart x) are **indices into the `Aligned` grid** = seconds since `Aligned.start`. (The spec sketch said "seconds into overlap"; aligned-grid indices are used instead so charts and anomalies share one axis.)
- Smoothing is a **centred** null-aware rolling mean (no visual time shift).
- Loaded files are never persisted; only settings go to `localStorage`, wrapped in try/catch.
- Commit after each task with the message given; end each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Power meter drops out but the head unit keeps recording** (records exist, `power` field absent) — expected: that second is 0 W, so it is reported as a dropout and does **not** split the overlap. Test in Task 4.
2. **Mid-ride pause where both read 0 W** — expected: overlap stays one segment; those seconds are excluded from stats. Test in Task 6/7.
3. **Coasting / near-zero meter power** — expected: no spike from tiny absolute differences, `diffPct` is `null` when meter < 20 W, drift blocks with meter mean < 50 W skipped. Tests in Tasks 8 and 9.
4. **Same file loaded in both slots** — expected: lag 0, r ≈ 1, mean diff 0, no anomalies. Test in Task 9.
5. **Meter recording started late / stopped early** (meter is a sub-span of the trainer) — expected: correct lag, overlap limited to the meter span. Test in Task 5.

---

## File Structure

```
package.json, vite.config.ts, svelte.config.js, tsconfig.json, index.html, .gitignore, README.md
.claude/launch.json            dev server config for previews
src/main.ts, src/app.css, src/App.svelte
src/lib/types.ts               shared types (Task 2)
src/lib/settings.ts            Settings, DEFAULT_SETTINGS, load/save (Task 2)
src/lib/format.ts              display formatting (Task 2)
src/lib/fit.ts                 FIT → ParsedFile (Task 3)
src/lib/series.ts              ParsedFile → Series (Task 4)
src/lib/smooth.ts              rolling mean (Task 4)
src/lib/align.ts               applyLag, correlationAt, autoLag (Task 5)
src/lib/overlap.ts             findOverlap (Task 6)
src/lib/stats.ts               computeStats (Task 7)
src/lib/anomalies.ts           detectAnomalies (Task 8)
src/lib/pipeline.ts            analyze() (Task 9)
src/components/FileDrop.svelte, AlignControl.svelte (Task 10)
src/components/PowerCharts.svelte (Task 11)
src/components/Summary.svelte, Settings.svelte (Task 12)
tests/helpers.ts               synthetic data builders (Task 2)
tests/*.test.ts                one per lib module + pipeline.test.ts (end-to-end)
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `index.html`, `.gitignore`, `README.md`, `.claude/launch.json`, `src/main.ts`, `src/app.css`, `src/App.svelte`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: working `npm test`, `npm run check`, `npm run build`, `npm run dev` (port 5173).

- [ ] **Step 1: Create config files** copied from `/Users/carrot/omega-calc` (`vite.config.ts`, `svelte.config.js`, `tsconfig.json`, `src/main.ts` verbatim). `package.json`: name `power-comp`, same scripts and devDependencies as omega-calc, plus dependencies `@garmin/fitsdk` `^21.221.0` and `uplot` `^1.6.32`. `index.html`: `lang="en"`, title `Power Comp`. `.gitignore`: `node_modules`, `dist`, `.DS_Store`. `.claude/launch.json`: one configuration `{"name":"dev","runtimeExecutable":"npm","runtimeArgs":["run","dev"],"port":5173}`. `src/App.svelte`: `<h1>Power Comp</h1>`. `src/app.css`: empty for now.
- [ ] **Step 2: Write `tests/smoke.test.ts`** — `expect(1 + 1).toBe(2)` (proves the runner works; deleted in Task 2).
- [ ] **Step 3: Install and verify**
  Run: `npm install && npm test && npm run check && npm run build && ls dist`
  Expected: 1 test passes; svelte-check `0 errors`; `dist` contains only `index.html`.
- [ ] **Step 4: README** — title, one-line description, the commands block from spec §9, a "How it works" paragraph (trainer slot first, meter second; auto-align then adjust), and the `src/lib` module list with one line each.
- [ ] **Step 5: Commit** — `git add -A ':!examples' ':!.DS_Store' && git commit -m "chore: scaffold Svelte + Vite single-file app"`

---

### Task 2: Types, settings, formatting, test helpers

**Files:**
- Create: `src/lib/types.ts`, `src/lib/settings.ts`, `src/lib/format.ts`, `tests/helpers.ts`, `tests/settings.test.ts`, `tests/format.test.ts`
- Delete: `tests/smoke.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Num = number | null;
  export interface FileMeta { fileName: string; device: string; start: Date; durationSec: number; avgPower: number }
  export interface FitRecord { t: number /* unix s, integer */; power: Num; cadence: Num }
  export interface ParsedFile { meta: FileMeta; records: FitRecord[] }
  export interface Series { start: number; power: Num[]; cadence: Num[] }        // 1 s grid
  export interface Aligned { start: number; trainer: Num[]; meter: Num[]; trainerCad: Num[]; meterCad: Num[] }
  export interface AlignResult { lagSec: number; r: number; method: 'timestamp-window' | 'full-search'; lowConfidence: boolean }
  export interface Overlap { from: number; to: number /* exclusive */; tooShort: boolean }
  export interface Extreme { w: number; pct: number; t: number }
  export interface Band { label: string; min: number; max: number | null; seconds: number; meanDiffW: number; meanDiffPct: number | null }
  export interface Stats { durationSec: number; meanTrainerW: number; meanMeterW: number; meanDiffW: number; meanDiffPct: number;
    meanAbsDiffW: number; sdDiffW: number; maxPos: Extreme; maxNeg: Extreme; bands: Band[] }
  export type AnomalyKind = 'spike' | 'dropout' | 'drift' | 'power-dependent' | 'cadence';
  export interface Anomaly { kind: AnomalyKind; severity: 'info' | 'warning'; from: number; to: number; message: string }
  ```
- Produces (`settings.ts`): `interface Settings`, `DEFAULT_SETTINGS`, `loadSettings(storage?: Storage | null): Settings`, `saveSettings(s: Settings, storage?: Storage | null): void`. Key `power-comp/settings`. Defaults (exact):
  `gapFillSec 3, searchWindowSec 300, minCorrelation 0.8, trimSec 30, smoothingSec 3, spikeAbsW 100, spikePct 50, dropoutMinW 50, dropoutMinSec 2, driftPctPts 3, bandSpreadPctPts 4, cadenceMedianRpm 3, cadenceRunRpm 10`.
  Fixed (not user settings, export as constants): `ALIGN_SMOOTH_SEC = 5`, `WINDOW_MIN_OVERLAP_FRAC = 0.6`, `FULL_SEARCH_MIN_OVERLAP_SEC = 600`, `MIN_OVERLAP_SEC = 300`, `SPIKE_MERGE_SEC = 5`, `DRIFT_BLOCK_SEC = 30`, `DRIFT_MIN_METER_W = 50`, `BAND_MIN_SEC = 60`, `CADENCE_RUN_SEC = 10`, `DIFF_PCT_MIN_METER_W = 20`, `SMOOTHING_OPTIONS = [1, 3, 10, 30]`.
- Produces (`format.ts`): `formatW(w: number, signed = false): string` → `"8.4 W"` / `"+8.4 W"` (1 decimal; `"−"` U+2212 for negatives); `formatPct(p: number, signed = false): string` → `"+6.1%"`; `formatDuration(sec: number): string` → `"1:59:10"`, `"4:05"` under an hour; `formatClock(d: Date): string` → local `"HH:MM:SS"`.
- Produces (`tests/helpers.ts`): `ridePower(n: number, seed = 1): number[]` — deterministic, distinctive interval-like signal ≥ 0 (e.g. sum of two sines with periods ~37 s and ~240 s around 180 W plus LCG noise ±15 W, rounded); `makeSeries(power: Num[], start = 1_700_000_000, cadence?: Num[]): Series` (cadence defaults to 90 where power non-null, else null).

- [ ] **Step 1: Write failing tests**
  `settings.test.ts`: `loadSettings(null)` equals `DEFAULT_SETTINGS`; with a fake Storage holding `{"spikeAbsW":150,"bogus":1,"trimSec":"x"}` → `spikeAbsW 150`, `trimSec 30`, no `bogus` key; storage whose `getItem` throws → defaults; `saveSettings` then `loadSettings` round-trips.
  `format.test.ts`: `formatW(8.44, true) === '+8.4 W'`; `formatW(-3, true) === '−3.0 W'`; `formatPct(6.08, true) === '+6.1%'`; `formatDuration(7150) === '1:59:10'`; `formatDuration(245) === '4:05'`.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL (modules not found).
- [ ] **Step 3: Implement** the three modules and `tests/helpers.ts`; delete `tests/smoke.test.ts`. `loadSettings` defaults `storage` to `globalThis.localStorage` inside try/catch and keeps only known keys with finite numeric values.
- [ ] **Step 4: Run** `npm test && npm run check` — Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** — `feat: shared types, settings and formatting`

---

### Task 3: FIT parsing

**Files:**
- Create: `src/lib/fit.ts`, `tests/fit.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `FitRecord`, `FileMeta` (Task 2).
- Produces: `parseFit(bytes: ArrayBuffer, fileName: string): ParsedFile`; `class FitError extends Error`. Error messages (exact): `"This doesn't look like a FIT file."`, `"No power data found in this file."`.

- [ ] **Step 1: Write failing tests** (read examples with `fs.readFileSync` → `.buffer.slice(byteOffset, byteOffset+byteLength)`)
  - `zwift-wahoo.fit`: `records.length === 7225`; `meta.start.toISOString() === '2026-11-11T16:41:14.000Z'`; `Math.round(meta.avgPower) === 143`; `meta.device` contains `'Zwift'`; every `t` is an integer.
  - `garmin-favero.fit`: `records.length === 7208`; `Math.round(meta.avgPower) === 135`; `meta.device === 'Edge 1040 · Favero'`.
  - `new Uint8Array([1,2,3,4]).buffer` → throws `FitError` with the "doesn't look like" message.
  - A FIT file with records but no power: build it with the SDK `Encoder` (file_id + 3 record messages with only timestamp/heartRate) → throws the "No power data" message.
- [ ] **Step 2: Run** `npx vitest run tests/fit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** with `Decoder`/`Stream.fromArrayBuffer` from `@garmin/fitsdk`; reject when `!decoder.isFIT()` or `read()` returns errors and no records. Record: `t = Math.round(timestamp.getTime()/1000)`, `power`/`cadence` `?? null`. `avgPower` = mean of non-null power. `durationSec` = last t − first t. Device label: manufacturer from `fileIdMesgs[0]` prettified (`zwift`→`Zwift`, `garmin`→`Garmin`, else capitalise), using `garminProduct` when present (`edge1040`→`Edge 1040`: split letters/digits, capitalise) instead of the manufacturer; if any `deviceInfoMesgs` has `antplusDeviceType === 'bikePower'` and its manufacturer differs, append ` · ` + prettified manufacturer with `Electronics` stripped (`faveroElectronics`→`Favero`).
- [ ] **Step 4: Run** `npx vitest run tests/fit.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: parse FIT files into power/cadence records`

---

### Task 4: Resampling and smoothing

**Files:**
- Create: `src/lib/series.ts`, `src/lib/smooth.ts`, `tests/series.test.ts`, `tests/smooth.test.ts`

**Interfaces:**
- Consumes: `ParsedFile`, `Series`, `Num`.
- Produces: `toSeries(file: ParsedFile, gapFillSec: number): Series`; `rollingMean(values: Num[], windowSec: number): Num[]`.

- [ ] **Step 1: Write failing tests**
  - `toSeries`: records at t = 100,101,103 (power 10,20,30) → `start 100`, `power [10,20,20,30]` (2 s gap filled by carry-forward).
  - gap of 5 s with `gapFillSec 3` → the 4 missing seconds are `null`.
  - duplicate timestamp t=101 twice (20 then 25) → last wins: index 1 is `25`.
  - **Review Focus 1:** a record that exists with `power: null` → `0` in `power` (not `null`), and does not affect neighbours; its `cadence: null` stays `null`.
  - single-record file → `power.length === 1`.
  - `rollingMean([1,2,3,4,5], 3)` → `[1.5,2,3,4,4.5]` (centred, edges average available values); `rollingMean([null,2,null], 3)` → `[2,2,2]`; all-null window → `null`; `windowSec 1` returns an equal copy.
- [ ] **Step 2: Run** `npx vitest run tests/series.test.ts tests/smooth.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Distinguish "no record this second" (`null`, gap-fillable) from "record without power" (`0`). Gap fill copies the previous non-null value into runs of `null` of length ≤ `gapFillSec` that have a value on both sides. `rollingMean` window: indices `i − floor((w−1)/2)` … `i + ceil((w−1)/2)`, O(n) with running sums.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: resample to 1 s grid and rolling mean`

---

### Task 5: Alignment

**Files:**
- Create: `src/lib/align.ts`, `tests/align.test.ts`

**Interfaces:**
- Consumes: `Series`, `Aligned`, `AlignResult`, `Settings`, constants from Task 2; `rollingMean` (Task 4).
- Produces:
  - `applyLag(trainer: Series, meter: Series, lagSec: number): Aligned` — grid spans the union of trainer `[start, start+len)` and shifted meter `[start+lag, start+lag+len)`; missing → `null`.
  - `correlationAt(trainer: Series, meter: Series, lagSec: number): { r: number | null; n: number }` — Pearson r of `ALIGN_SMOOTH_SEC`-smoothed power over seconds where both non-null; `n` = that count; `r null` when n < 2 or zero variance.
  - `autoLag(trainer: Series, meter: Series, s: Settings): AlignResult`.

- [ ] **Step 1: Write failing tests** (base = `ridePower(3600)`)
  - `applyLag(makeSeries([1,2,3],100), makeSeries([7,8],101), 0)` → `start 100`, `trainer [1,2,3]`, `meter [null,7,8]`; same with lag `−1` → `meter [7,8,null]`.
  - trainer = base × 1.05 at start S; meter = base at start S + 4 (meter clock late by 4 s, same physical moment) → `autoLag` → `lagSec === -4`, `r > 0.99`, `method 'timestamp-window'`, `lowConfidence false`.
  - meter clock 20 min off (start S + 1200 for identical content) → `method 'full-search'`, `lagSec === -1200`.
  - unrelated signals (`ridePower(3600,1)` vs `ridePower(3600,99)`) → `lowConfidence true`.
  - true lag exactly at the window edge (`searchWindowSec` = 300, offset 300) → found (`lagSec === -300`).
  - **Review Focus 5:** meter = base slice [900, 2700) placed at S + 900 + 3 → `lagSec === -3`.
  - `correlationAt` on identical series at lag 0 → `r` within 1e-9 of 1, `n === length`.
- [ ] **Step 2: Run** `npx vitest run tests/align.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** Smooth both series once, then evaluate lags with an internal helper (do not re-smooth per lag). Window pass: lags `−searchWindowSec…+searchWindowSec`, eligible when `n ≥ WINDOW_MIN_OVERLAP_FRAC × min(nonNullCount(trainer), nonNullCount(meter))`. If best r < `minCorrelation` (or no eligible lag): full pass over every lag whose span overlap ≥ `FULL_SEARCH_MIN_OVERLAP_SEC`, eligible when `n ≥ FULL_SEARCH_MIN_OVERLAP_SEC`; return whichever pass has higher r. Ties → smallest |lag|. No eligible lag at all → `{lagSec: 0, r: 0, method: 'timestamp-window', lowConfidence: true}`. Full search on 2 h files is ~14k lags × ~7k points — acceptable (<2 s); keep it a plain loop over typed arrays.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: automatic lag detection by cross-correlation`

---

### Task 6: Longest common part

**Files:**
- Create: `src/lib/overlap.ts`, `tests/overlap.test.ts`

**Interfaces:**
- Consumes: `Aligned`, `Overlap`, `Settings`, `MIN_OVERLAP_SEC`.
- Produces: `findOverlap(a: Aligned, s: Settings): Overlap | null` — `null` when no common second remains after trimming.

- [ ] **Step 1: Write failing tests** (build `Aligned` literals directly)
  - both non-null for indices 10…1009 → with `trimSec 30` → `{from: 40, to: 980, tooShort: false}`.
  - two common runs (len 400 and 900) separated by a `null` gap in meter → picks the 900 run.
  - run of 320 s → trimmed to 260 → `tooShort: true`.
  - run of 50 s with `trimSec 30` → `null`; no common seconds → `null`.
  - **Review Focus 2:** 2000 common seconds with 300 s of both = 0 in the middle → a single overlap spanning all of it (zeros do not split).
- [ ] **Step 2: Run** `npx vitest run tests/overlap.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — single pass over the grid tracking the longest run where `trainer[i] !== null && meter[i] !== null`; then trim; `tooShort = to − from < MIN_OVERLAP_SEC`.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: longest common segment with edge trim`

---

### Task 7: Statistics

**Files:**
- Create: `src/lib/stats.ts`, `tests/stats.test.ts`

**Interfaces:**
- Consumes: `Aligned`, `Overlap`, `Stats`, `Band`, `Extreme`; `rollingMean`.
- Produces:
  - `BANDS: {label: string; min: number; max: number | null}[]` = `<150 W` [0,150), `150–250 W` [150,250), `250–350 W` [250,350), `>350 W` [350,∞), by **meter** power.
  - `computeStats(a: Aligned, ov: Overlap, smoothingSec: number): Stats` — smooth the full `a.trainer`/`a.meter` first, then use indices `ov.from…ov.to−1`, skipping seconds where both raw values are 0.

- [ ] **Step 1: Write failing tests**
  - meter = 200 constant, trainer = 210 constant over 1000 s → `meanDiffW 10`, `meanDiffPct 5`, `meanAbsDiffW 10`, `sdDiffW 0`.
  - ratio-of-means: meter `[100, 300]` repeated, trainer `[110, 300]` → `meanDiffPct === 2.5` (not 5).
  - one index with trainer +60 W at t=500, another with −40 W at t=700 (smoothing 1) → `maxPos {w: 60, t: 500, pct: 60/meter×100}`, `maxNeg {w: −40, t: 700}` (`maxNeg.w` = minimum diff, may be positive if trainer is always higher).
  - **Review Focus 2:** adding 300 both-zero seconds inside the overlap leaves `meanDiffW` unchanged and `durationSec` (= seconds actually used) unchanged.
  - bands (smoothing 1): meter 120 for 100 s then 300 for 100 s, trainer +10% → bands `<150` and `250–350` each `seconds 100`, `meanDiffPct 10`; empty bands `seconds 0`, `meanDiffPct null`.
  - smoothing 3 vs 1 on a single 1 s +90 W blip → `maxPos.w` 30 vs 90.
- [ ] **Step 2: Run** `npx vitest run tests/stats.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** — single pass accumulating sums; `pct` for extremes = `diff / max(meter, 1) × 100`; `sdDiffW` population SD.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: difference statistics and power bands`

---

### Task 8: Anomaly detection

**Files:**
- Create: `src/lib/anomalies.ts`, `tests/anomalies.test.ts`

**Interfaces:**
- Consumes: `Aligned`, `Overlap`, `Stats`, `Settings`, `Anomaly`, constants (`SPIKE_MERGE_SEC`, `DRIFT_BLOCK_SEC`, `DRIFT_MIN_METER_W`, `BAND_MIN_SEC`, `CADENCE_RUN_SEC`); `formatPct`, `formatDuration`.
- Produces: `detectAnomalies(a: Aligned, ov: Overlap, stats: Stats, s: Settings): Anomaly[]`, sorted by `from`; drift / power-dependent / median-cadence findings span the whole overlap. Uses **raw** (unsmoothed) aligned data; band figures from `stats.bands`.

Messages (exact templates; `{}` filled with `formatPct`/`formatW`/`formatDuration`):
- spike: `"Spike: trainer {+95.0 W} vs power meter ({+73.1%})"` (sign per larger |diff| in event)
- dropout: `"Dropout: {power meter|trainer} read 0 W for {0:05} while the other read {180.0 W} avg"`
- drift: `"Difference drifts from {+3.1%} to {+8.4%} over {2:00:00}"`
- power-dependent: `"Difference depends on power: {+10.0%} at {<150 W} vs {+2.0%} at {250–350 W}"`
- cadence median: `"Cadence differs by {4} rpm (median) — check alignment or cadence sensor"`
- cadence run: `"Cadence differs by more than {10} rpm for {0:25}"`

- [ ] **Step 1: Write failing tests** (base: `ridePower(3600)` as meter, trainer = meter × 1.05, overlap = whole range; stats from `computeStats(…, 3)`)
  - clean data → `[]`.
  - one second trainer +150 W where meter = 200 → 1 `spike`, `severity 'warning'`; two such seconds 3 s apart → still 1 event spanning both; 10 s apart → 2 events.
  - **Review Focus 3:** meter 0, trainer 30 → no spike (abs below 100); meter 10, trainer 120 → spike (110 W and > 50%).
  - meter 0 for 5 s while trainer ~200 → 1 `dropout` (`from`/`to` cover the 5 s); 1 s only → none (`dropoutMinSec 2`).
  - trainer = meter × (1.03 + 0.06·t/T) → `drift`, message matches `/from \+(2\.9|3\.0|3\.1)% to \+(8\.9|9\.0|9\.1)%/`, `severity 'warning'` (6 pp ≥ 2×3); × (1.03 + 0.035·t/T) → `severity 'info'`; × 1.05 → none.
  - **Review Focus 3:** first 10 min meter < 50 W with trainer ×1.5 → those blocks ignored; no drift reported.
  - trainer +10% below 150 W, +2% above 250 W (meter alternating 120/300 in 2-min blocks) → `power-dependent` `info`.
  - cadence offset +5 rpm everywhere → cadence median finding; cadence +15 rpm for 12 s only → cadence run finding; any cadence array all `null` → no cadence findings.
- [ ] **Step 2: Run** `npx vitest run tests/anomalies.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** one private function per kind, concatenated and sorted. Drift: 30 s blocks within the overlap, block % = (mean trainer − mean meter)/mean meter × 100, skip blocks with meter mean < `DRIFT_MIN_METER_W`, least-squares fit over block centres, start/end values = fit at overlap start/end; require ≥ 4 blocks. Severity drift: `warning` if |change| ≥ 2 × `driftPctPts` else `info`.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: detect spikes, dropouts, drift, power-dependent error, cadence mismatch`

---

### Task 9: Pipeline and end-to-end test

**Files:**
- Create: `src/lib/pipeline.ts`, `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–8.
- Produces:
  ```ts
  export interface Analysis {
    aligned: Aligned; overlap: Overlap | null; r: number | null;
    smoothed: { trainer: Num[]; meter: Num[]; diffW: Num[]; diffPct: Num[] };  // full aligned length
    stats: Stats | null;            // null when overlap null or tooShort
    anomalies: Anomaly[];           // [] when stats null
  }
  export function analyze(trainer: Series, meter: Series, lagSec: number, s: Settings): Analysis;
  ```
  `diffW = trainer − meter` (null if either null); `diffPct = diffW / meter × 100`, `null` when meter < `DIFF_PCT_MIN_METER_W` (Review Focus 3). `r` from `correlationAt`.

- [ ] **Step 1: Write failing tests**
  - **End-to-end:** parse both `examples/*.fit` → `toSeries` → `autoLag(DEFAULT_SETTINGS)` → `analyze`: `Math.abs(lagSec) <= 10` (measured: −2), `r > 0.9` (measured: 0.97), `stats.meanDiffPct` between 3 and 9, `stats.durationSec > 6600`, `overlap.tooShort === false`.
  - **Review Focus 4:** the same parsed file passed as both trainer and meter → `lagSec 0`, `r > 0.999`, `stats.meanDiffW === 0`, `anomalies` `[]`.
  - overlap under 5 min → `stats null`, `anomalies []`, `smoothed` still populated.
  - meter = 10 W, trainer = 40 W → `diffPct` entries `null`.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `analyze` as composition only (no new algorithms).
- [ ] **Step 4: Run** `npm test && npm run check` — Expected: all PASS, 0 errors.
- [ ] **Step 5: Commit** — `feat: analysis pipeline with end-to-end test on example rides`

---

### Task 10: File slots, alignment bar, app state

**Files:**
- Create: `src/components/FileDrop.svelte`, `src/components/AlignControl.svelte`
- Modify: `src/App.svelte`, `src/app.css`

**Interfaces:**
- Consumes: `parseFit`, `FitError`, `toSeries`, `autoLag`, `analyze`, `loadSettings`/`saveSettings`, `formatClock`/`formatDuration`/`formatW`.
- Produces:
  - `FileDrop` props: `label: string`, `file: ParsedFile | null`, `error: string | null`, `onfile: (f: File) => void`. Drop zone + hidden `<input type="file" accept=".fit">`; shows file name, device, start (local clock), duration, avg power, or `error`.
  - `AlignControl` props: `auto: AlignResult`, `lagSec: number`, `r: number | null`, `onlag: (lag: number) => void`, `onrerun: () => void`, `range: number` (= max(`searchWindowSec`, |auto.lagSec|)). Shows `"Auto: {+2} s, r = {0.97} ({timestamp window|full search})"`, slider `−range…+range`, −1/+1 buttons, number input, Re-run auto; low-confidence banner text (exact): `"Low confidence — these may not be the same ride."`; current r shown live.
  - `App.svelte` state (Svelte 5 runes): `trainerFile`, `meterFile`, errors, `settings` (`$state(loadSettings())`, saved via `$effect`), `auto`, `lagSec`, `analysis = $derived(...)`. ⇄ swap button swaps files and re-runs `autoLag`. Loading a file reads `File.arrayBuffer()` → `parseFit`; on `FitError` show its message in that slot.
- CSS tokens on `:root` for `--trainer` (orange) and `--meter` (blue), background/text/border, with dark values under `@media (prefers-color-scheme: dark)`.

- [ ] **Step 1: Implement** the two components and App wiring; temporarily render `analysis.stats` as `<pre>{JSON.stringify(...)}</pre>` below the alignment bar.
- [ ] **Step 2: Verify** `npm run check` → 0 errors; `npm test` → PASS.
- [ ] **Step 3: Verify in browser** — `preview_start {name:"dev"}`. Load the examples with `javascript_tool`: `fetch('/@fs/Users/carrot/Dev/power-comp/examples/<file>')` → `new File([blob], name)` → assign to each slot's `<input type="file">` via a `DataTransfer` and dispatch `change`. (Reuse this snippet in Tasks 11–12.) Expected: both slots show device "Zwift" / "Edge 1040 · Favero"; alignment bar shows `Auto: −2 s, r = 0.97`; moving the slider changes r; loading a `.txt` renamed `.fit` shows `"This doesn't look like a FIT file."`; ⇄ swaps.
- [ ] **Step 4: Commit** — `feat: file loading and alignment controls`

---

### Task 11: Charts

**Files:**
- Create: `src/components/PowerCharts.svelte`
- Modify: `src/App.svelte` (replace the `<pre>` debug output's position with charts; keep it below for now)

**Interfaces:**
- Consumes: `Analysis`, `SMOOTHING_OPTIONS`, `formatDuration`.
- Produces: `PowerCharts` props `analysis: Analysis`, `smoothingSec: number`, `onsmoothing: (s: number) => void`, `anomalies: Anomaly[]`; exported method `zoomTo(from: number, to: number): void` (pads 10% each side; used by Task 12 via `bind:this`).

Behaviour:
- Three `uPlot` instances, x = aligned-grid seconds, x-axis labels via `formatDuration`. Chart 1 "Power (W)": trainer `--trainer`, meter `--meter`. Chart 2 "Difference (W)": `diffW` with a zero line and a dot at each spike/dropout `from`. Chart 3 "Difference (%)": `diffPct`.
- Cursor synced with `uPlot.sync('power-comp')`; zoom sync: `hooks.setScale` on x pushes the same min/max to the other two (guard re-entry). Drag-to-zoom on x; double-click resets all three.
- Overlap region shaded and areas outside it greyed via a `drawClear` hook.
- Width follows container (`ResizeObserver` → `setSize`); recreate plots when `analysis` changes. Import `uplot/dist/uPlot.min.css`.
- Smoothing selector (buttons for `SMOOTHING_OPTIONS`) above the charts.
- Colours read from CSS custom properties at plot creation; recreate on `prefers-color-scheme` change.

- [ ] **Step 1: Implement** the component and mount it in `App.svelte`.
- [ ] **Step 2: Verify** `npm run check` → 0 errors.
- [ ] **Step 3: Verify in browser** — load examples as in Task 10; screenshot. Expected: three stacked charts, curves visibly overlap, drag-zoom on one zooms all three, double-click resets, smoothing 30 s visibly smooths, no console errors (`read_console_messages onlyErrors`). Check dark mode with `resize_window colorScheme: 'dark'` and at mobile width (375) no horizontal scroll.
- [ ] **Step 4: Commit** — `feat: synced power and difference charts`

---

### Task 12: Summary, settings panel, final build

**Files:**
- Create: `src/components/Summary.svelte`, `src/components/Settings.svelte`
- Modify: `src/App.svelte` (remove `<pre>` debug output; add Summary and Settings), `README.md` (screenshot-free usage notes)

**Interfaces:**
- Consumes: `Stats`, `Anomaly`, `Overlap`, `Settings`, `DEFAULT_SETTINGS`, `BANDS`, format helpers, `PowerCharts.zoomTo`.
- Produces:
  - `Summary` props `stats: Stats | null`, `overlap: Overlap | null`, `anomalies: Anomaly[]`, `onselect: (a: Anomaly) => void`.
    Headline (exact): `"Trainer reads {+6.1%} ({+8.4 W}) vs power meter over {1:59:10}"` (`reads` stays even when negative; sign shows direction). Stats table rows: Avg trainer, Avg power meter, Avg difference (W), Avg difference (%), Mean absolute difference, Std. deviation of difference, Max positive deviation (W, %, at time), Max negative deviation (W, %, at time). Band table: band, time in band, avg diff W, avg diff %. Warnings list: icon (⚠ warning / ℹ info), message, time (`formatDuration(from)`), clickable → `onselect`. Empty state (exact): `"No unusual readings found."` When `overlap` is null or `tooShort` (exact): `"Not enough overlapping data to compare (need at least 5 minutes after trimming). Check the alignment or the files."`
  - `Settings` props `settings: Settings`, `onchange: (s: Settings) => void`; `<details>` panel "Settings" with one labelled number input per `Settings` key (with units), and "Reset to defaults".

- [ ] **Step 1: Implement** both components; wire `onselect` to `charts.zoomTo(a.from, a.to)` and settings changes into `settings` state (already persisted by Task 10's `$effect`).
- [ ] **Step 2: Verify** `npm test && npm run check` → PASS, 0 errors.
- [ ] **Step 3: Verify in browser (dev)** — load examples. Expected: headline shows a positive % in the 3–9 range; band table filled; clicking a warning zooms the charts; changing `trimSec` updates the duration; reload page → settings kept, files gone; Reset restores defaults.
- [ ] **Step 4: Verify the offline build** — `npm run build`; `ls dist` shows only `index.html`; `grep -Eo '<(script|link)[^>]+(src|href)="https?://' dist/index.html` → no output; open `file:///Users/carrot/Dev/power-comp/dist/index.html` in the browser pane, load both examples, screenshot. Expected: identical behaviour to dev, no console errors, no network requests besides the file itself (`read_network_requests`).
- [ ] **Step 5: Commit** — `feat: summary, warnings and settings panel`
