# Power Comp — design spec

Date: 2026-11-11
Status: approved in brainstorming, awaiting written-spec review

## 1. Purpose

A reusable, offline, single-page browser app for comparing power readings from two sources
recorded during the same ride:

- **File 1 — smart trainer** (e.g. Wahoo via Zwift)
- **File 2 — another power meter** (e.g. Favero pedals via Garmin Edge)

The user loads two FIT files, the app aligns them in time (automatically, with manual
override), and for the longest common part reports how much the sources disagree and warns
about unusual readings.

**Success:** load any two FIT files from one ride, see them correctly aligned, and immediately
see how far the trainer is from the power meter and whether anything looks wrong.

### Constraints

- Runs entirely in the browser; no data leaves the machine; works without internet.
- Build output is a single self-contained `dist/index.html` (opens by double-click).
- UI language: English.
- Stack mirrors the user's `omega-calc` project: Svelte + Vite + TypeScript, Vitest for tests,
  single-file build.

### Out of scope

Saving sessions or files, multi-ride history, non-FIT formats, more than two sources,
hosting/deployment, i18n.

## 2. Reference data

`examples/zwift-wahoo.fit` and `examples/garmin-favero.fit` (same ride, 2026-11-11):

| | Trainer (Zwift) | Meter (Edge 1040 + Favero) |
|---|---|---|
| Records | 7225 @ 1 s (one 2 s gap) | 7208 @ 1 s |
| Start (UTC) | 16:41:14 | 16:41:14 |
| Duration | 2:00:25 | 2:00:07 |
| Avg / max power | 143 W / 330 W | 135 W / 273 W |
| Fields used | timestamp, power, cadence | timestamp, power, cadence |

Both decode without errors using `@garmin/fitsdk`.

## 3. Architecture

All computation lives in pure TypeScript modules under `src/lib/` with no UI or DOM
dependencies; Svelte components only render state and forward user input.

```
src/lib/
  types.ts      shared types
  fit.ts        FIT bytes → ParsedFile { meta, records: {t, power, cadence}[] }
  series.ts     resample to 1 s grid; fill gaps ≤ 3 s; longer gaps → null
  smooth.ts     rolling mean (window in seconds), null-aware
  align.ts      cross-correlation lag search → { lagSec, r, method }; applyLag()
  overlap.ts    longest common segment after lag, minus trim
  stats.ts      differences, extremes, power-band breakdown
  anomalies.ts  spikes, dropouts, drift, power-dependent error, cadence mismatch
  settings.ts   Settings type + DEFAULT_SETTINGS (all thresholds in one place)
  format.ts     W / % / duration / clock-time formatting
src/components/
  FileDrop.svelte      two slots: "Smart trainer" / "Power meter"; swap button
  AlignControl.svelte  auto result, slider, ±1 s, numeric input, re-run auto
  PowerCharts.svelte   three synced uPlot charts
  Summary.svelte       headline, stats table, band table, warnings list
  Settings.svelte      collapsible thresholds panel
src/App.svelte         wires the pipeline together
tests/                 one test file per lib module + end-to-end on examples/*.fit
```

Dependencies: `@garmin/fitsdk` (parsing), `uplot` (charts), a Vite single-file plugin
(as in omega-calc) for the build.

### Data flow

```
File 1, File 2
  → fit.parse          (once per file load)
  → series.resample    (once per file load)
  → align.autoLag      (on load / "re-run auto"; user may override lag)
  → applyLag + overlap (on lag or settings change)
  → smooth             (on smoothing change)
  → stats + anomalies  (on any of the above)
  → UI
```

Each stage recomputes only when its inputs change. Data size (~7,200 points per series for a
2 h ride) needs no web worker.

## 4. Core types (sketch)

```ts
interface ParsedFile {
  meta: { fileName: string; device: string; start: Date; durationSec: number; avgPower: number };
  records: { t: number /* unix s */; power: number | null; cadence: number | null }[];
}
interface Series {          // 1 s grid
  start: number;            // unix s of index 0
  power: (number | null)[];
  cadence: (number | null)[];
}
interface AlignResult { lagSec: number; r: number; method: 'timestamp-window' | 'full-search'; lowConfidence: boolean }
// lagSec: seconds added to the meter's absolute timestamps. Meter sample at absolute time T
// is compared with trainer sample at T + lagSec. lagSec = 0 means "trust the timestamps".
interface Anomaly {
  kind: 'spike' | 'dropout' | 'drift' | 'power-dependent' | 'cadence';
  severity: 'info' | 'warning';
  from: number; to: number;  // seconds into overlap
  message: string;
}
```

## 5. Algorithms

### 5.1 Parsing (`fit.ts`)

Decode with `@garmin/fitsdk`. Take `recordMesgs` timestamp, power, cadence. Device label:
from `fileIdMesgs[0]` manufacturer/product name, plus a `deviceInfoMesgs` entry with
device type `bikePower` if present (e.g. "Edge 1040 · Favero"). Errors:

- not a valid FIT file → "This doesn't look like a FIT file."
- no record has power → "No power data found in this file."

### 5.2 Resampling (`series.ts`)

Index = second offset from the file's first timestamp. Duplicate timestamps: keep the last.
Gaps ≤ `gapFillSec` (default 3 s) filled by carrying the previous value forward; longer gaps
are `null`.

### 5.3 Alignment (`align.ts`)

1. Both series are placed on the absolute timeline using their own timestamps; the initial
   guess is therefore lag 0.
2. Both power series smoothed with a 5 s rolling mean.
3. For each lag in `−searchWindowSec … +searchWindowSec` (default 300) at 1 s steps: Pearson r over seconds
   where both are non-null. A lag is eligible only if that overlap ≥ 60% of the shorter
   series' length.
4. Best r wins (`method: 'timestamp-window'`).
5. If best r < `minCorrelation` (default 0.8): run a second pass over every lag giving
   ≥ 10 min of overlap, ignoring timestamps (`method: 'full-search'`). Report the higher-r
   result of the two passes.
6. If the final r < 0.8 → `lowConfidence: true`, UI shows "Low confidence — these may not be
   the same ride."

Manual override replaces `lagSec`; r is recomputed for the current lag and displayed.

### 5.4 Overlap (`overlap.ts`)

After applying the lag, find the longest contiguous run of seconds where both power values
are non-null (runs are split by gaps > `gapFillSec`, which are already null). Trim
`trimSec` (default 30 s) from each end. Seconds where both sources read 0 W stay in the
charts but are excluded from statistics. If the trimmed overlap is < 5 min, no statistics are
computed and the UI explains why.

### 5.5 Statistics (`stats.ts`)

Computed on the overlap at the selected smoothing (default 3 s; options 1/3/10/30 s).
`diff = trainer − meter`.

- mean diff (W)
- mean diff (%) = (mean trainer − mean meter) / mean meter × 100 (ratio of means)
- mean absolute diff (W), standard deviation of diff (W)
- max positive and max negative deviation, in W and % of meter, each with its time
- per power band of meter power (< 150, 150–250, 250–350, > 350 W): seconds in band, mean
  diff W and % (ratio of means within band)
- overlap duration

### 5.6 Anomalies (`anomalies.ts`)

All thresholds from `Settings`; defaults in parentheses.

1. **Spike** — on raw 1 s data: `|diff| > spikeAbsW` (100 W) **and** `|diff| / max(meter, 1)
   > spikePct` (50%). Events closer than 5 s merge into one. Severity: warning.
2. **Dropout** — one source is 0 or null while the other > `dropoutMinW` (50 W) for
   ≥ `dropoutMinSec` (2 s). Severity: warning.
3. **Drift** — 30 s block means; % diff per block (ratio of block means, blocks with
   meter mean < 50 W skipped); linear regression of % diff vs time. Change across the
   overlap = slope × duration. Flag if `|change| ≥ driftPctPts` (3 pp). Message e.g.
   "Difference drifts from +3.1% to +8.4% over 2:00:00." Severity: warning if ≥ 2× threshold,
   else info.
4. **Power-dependent error** — from band table, bands with ≥ 60 s of data; flag if
   max band % − min band % ≥ `bandSpreadPctPts` (4 pp). Severity: info.
5. **Cadence mismatch** — only if both have cadence. Flag if median |cadence diff| >
   `cadenceMedianRpm` (3 rpm), or any run ≥ 10 s with |cadence diff| > `cadenceRunRpm`
   (10 rpm). Severity: info.

Each anomaly carries a time range; clicking it in the UI zooms the charts to that range (with
padding).

### 5.7 Settings (`settings.ts`)

`gapFillSec`, `searchWindowSec`, `minCorrelation`, `trimSec`, `smoothingSec`, `spikeAbsW`,
`spikePct`, `dropoutMinW`, `dropoutMinSec`, `driftPctPts`, `bandSpreadPctPts`,
`cadenceMedianRpm`, `cadenceRunRpm`. Persisted in `localStorage` (wrapped in try/catch,
falls back to defaults). Loaded files are never persisted.

## 6. UI

Single page, top to bottom:

1. **File slots** — two drop zones (also click to choose), labelled *Smart trainer* and
   *Power meter*. Each shows file name, device, start time, duration, average power, or an
   error message. ⇄ button swaps the files.
2. **Alignment bar** — "Auto: +2 s, r = 0.97 (timestamp window)"; slider ±`searchWindowSec`
   (widened to include the auto lag if a full search found one outside that range);
   −1 / +1 buttons; numeric input; *Re-run auto*. Current r updates live with the lag.
3. **Charts** (uPlot, shared x-axis = time into ride, synced cursor and zoom; drag to zoom,
   double-click to reset):
   - Power: trainer and meter overlaid
   - Difference (W), zero line, anomaly markers
   - Difference (%)
   Smoothing selector above the charts. Overlap region shaded; trimmed/excluded areas greyed.
4. **Summary** — headline "Trainer reads +6.1% (+8.4 W) vs power meter over 1:59:10";
   stats table; power-band table; warnings list (severity icon, message, time; click → zoom).
   Empty state "No unusual readings found."
5. **Settings** — collapsible panel with all thresholds and *Reset to defaults*.

Fixed colours: trainer and meter each have one colour used consistently across all charts
and tables. Light and dark themes via `prefers-color-scheme`.

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Invalid FIT / no power | Message in that file's slot; rest of page waits |
| Files loaded in wrong slots | ⇄ swap button |
| Low alignment confidence | Warning banner in alignment bar; stats still shown |
| Overlap < 5 min after trim | Charts shown; stats replaced by an explanation |
| `localStorage` unavailable | Defaults used silently |

## 8. Testing

Vitest, written test-first per module.

- **Synthetic**: build a meter series, derive trainer = meter × 1.05 shifted +4 s → align
  finds lag 4, stats ≈ +5%. Inject a spike, a dropout, a linear drift, a power-dependent
  scale, and a cadence offset → each detected; clean data → no anomalies.
- **Edge cases**: no overlap, all zeros, mid-ride gap, swapped inputs, single-sample file,
  lag at window edge, full-search fallback.
- **End-to-end**: parse `examples/*.fit` through the whole pipeline; assert |lag| ≤ 10 s,
  r > 0.9, mean diff % between +3 and +9.
- `npm run check` (types) clean; `npm run build` produces a single `dist/index.html` that
  works offline, verified by opening it in a browser.

## 9. Commands (README)

```
npm install
npm run dev     # live preview
npm test        # calculation tests
npm run check   # type check
npm run build   # → dist/index.html
```
