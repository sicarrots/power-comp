# Difference vs Power Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Difference vs power" chart to the summary. It shows whether the trainer − power-meter difference is linear across the whole power range, using every usable second.

**Architecture:** A new pure module `src/lib/powerCurve.ts` computes points, 10 W bin means, a least-squares straight line and the largest bin departure from that line. `analyze()` exposes the result as `Analysis.curve`. A new uPlot component, `PowerCurveChart.svelte`, renders it under the band table in `Summary.svelte`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest, uPlot ^1.6.32. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-13-power-difference-curve-design.md`

## Global Constraints

- **Difference sign:** trainer − power meter, everywhere.
- **X axis:** smoothed power-meter power (W).
- **Data:** exactly the seconds `computeStats` uses. That means inside the overlap, at `smoothingSec`, with both smoothed values non-null, and excluding seconds where both raw values are 0.
- **Constants** in `src/lib/settings.ts`: `CURVE_BIN_W = 10` and `CURVE_MIN_BIN_SEC = 30`. Reuse `DIFF_PCT_MIN_METER_W = 20` for the % mode.
- **No new user settings.** The band table, warnings and time charts are unchanged.
- **Caption copy (exact):** `Difference ≈ {formatW(interceptW, true)} + {formatPct(slope*100, true)} of power · bins depart from the line by up to {formatW(maxBinDeviationW)} (at {Math.round(maxBinDeviationAtW)} W)`. The part after `·` reads `bins depart from the line by up to —` when fewer than 2 bins are present. With no fit at all, the whole caption is `Not enough data for a straight-line fit.`
- **Chart title (exact):** `Difference vs power`. **Toggle labels:** `W` and `%`.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/power-curve`.

## Review Focus

1. **Coasting and dropouts at very low meter power** (meter ≈ 0 while the trainer reads 30–200 W). In W mode these show as points and in the 0–10 W bin if it has ≥ 30 s. In % mode, points and bins with meter < 20 W are omitted, and the % fit curve is drawn only from 20 W up. Test in Task 1.
2. **Steady ride with one power level** (all seconds in one or two bins). The fit still works if the x variance is > 0. With < 2 bins, `maxBinDeviationW` is null and the caption shows "—". If x has zero variance, `fit` is null. Test in Task 1.
3. **Changing smoothing, lag or trim** recomputes the curve, because it derives from `analyze()`. Test in Task 2: smoothing 1 vs 30 gives different point counts or values.
4. **Overlap too short or null.** `curve` is null and the chart is not rendered. Test in Task 2.
5. **Theme switch.** The chart recreates with the right colours, like `PowerCharts`. Verified in the browser in Task 3.

---

## File Structure

```
src/lib/settings.ts         + CURVE_BIN_W, CURVE_MIN_BIN_SEC            (Task 1)
src/lib/types.ts            + CurvePoint, CurveBin, CurveFit, PowerCurve (Task 1)
src/lib/powerCurve.ts       computePowerCurve()                          (Task 1)
tests/powerCurve.test.ts                                                 (Task 1)
src/lib/pipeline.ts         Analysis.curve                               (Task 2)
tests/pipeline.test.ts      + curve cases                                (Task 2)
src/components/PowerCurveChart.svelte                                    (Task 3)
src/components/Summary.svelte  mount chart under band table              (Task 3)
src/App.svelte              pass analysis.curve to Summary               (Task 3)
src/app.css                 chart styles if needed                       (Task 3)
```

---

### Task 1: Curve computation

**Files:**
- Modify: `src/lib/settings.ts`, `src/lib/types.ts`
- Create: `src/lib/powerCurve.ts`, `tests/powerCurve.test.ts`

**Interfaces:**
- Consumes: `Aligned`, `Overlap`, `Num` (types.ts); `rollingMean` (smooth.ts); `DIFF_PCT_MIN_METER_W` (settings.ts).
- Produces (types.ts):
  ```ts
  export interface CurvePoint { meterW: number; diffW: number; diffPct: number | null }
  export interface CurveBin { centerW: number; seconds: number; meanDiffW: number; meanDiffPct: number | null }
  export interface CurveFit { interceptW: number; slope: number; maxBinDeviationW: number | null; maxBinDeviationAtW: number | null }
  export interface PowerCurve { points: CurvePoint[]; bins: CurveBin[]; fit: CurveFit | null }
  ```
  Also `computePowerCurve(a: Aligned, ov: Overlap, smoothingSec: number): PowerCurve` in `src/lib/powerCurve.ts`.

Rules:
- **Points:** one per usable second (per Global Constraints). `diffPct` = diffW / meterW × 100, or null when meterW < `DIFF_PCT_MIN_METER_W`.
- **Bins:** bin index = `Math.floor(meterW / CURVE_BIN_W)` and `centerW = index × CURVE_BIN_W + CURVE_BIN_W / 2`. Keep only bins with `seconds >= CURVE_MIN_BIN_SEC`, sorted by `centerW`. `meanDiffPct` is a ratio of means within the bin (Σdiff / Σmeter × 100), or null when the bin's mean meter < `DIFF_PCT_MIN_METER_W`.
- **Fit:** ordinary least squares of `diffW` on `meterW` over all points. It is null when there are < 2 points or the x variance is 0. `maxBinDeviationW` = max over bins of `|meanDiffW − (interceptW + slope × centerW)|`, and `maxBinDeviationAtW` is that bin's `centerW`. Both are null when bins < 2.

- [ ] **Step 1: Write the failing tests** in `tests/powerCurve.test.ts`. Build `Aligned` literals: meter = `ridePower(3600)` (80–350 W), cadence null, overlap `{from: 0, to: 3600, tooShort: false}`, smoothing 1 unless stated.
  - `linear`: trainer = meter × 1.05 + 2 → `fit.interceptW` within 0.01 of 2, `fit.slope` within 1e-4 of 0.05, `fit.maxBinDeviationW` < 0.01, `points.length === 3600`, every bin has `seconds >= 30`, and bins are sorted ascending by `centerW`.
  - `non-linear`: trainer = meter × (meter < 150 ? 1.10 : meter >= 250 ? 1.02 : 1.06) → `fit.maxBinDeviationW > 2`.
  - `bin centres`: meter constant 104 for 40 s and 207 for 40 s, trainer = meter + 5 → bins `[{centerW: 105, seconds: 40, meanDiffW: 5}, {centerW: 205, seconds: 40, meanDiffW: 5}]` (`meanDiffPct` ≈ 5/104·100 and 5/207·100).
  - `sparse bin dropped`: add 10 s at meter 400 → no bin with `centerW 405`; the points still include those 10 s.
  - `both-zero excluded`: append 300 s where both read 0 → `points.length` is unchanged versus without them.
  - **Review Focus 1:** meter 0 and trainer 120 for 60 s, inside an otherwise normal ride → a bin `centerW 5` exists in W terms with `meanDiffPct === null`, and those points have `diffPct === null`.
  - **Review Focus 2:** meter constant 200 for 600 s (zero x variance) → `fit === null` and one bin. Meter 200 for 600 s, then 210 for 600 s → `fit` is non-null and `maxBinDeviationW` is a number. Meter 200 for 600 s and 203 for 600 s (same bin) → `fit` is non-null, `maxBinDeviationW === null`.
- [ ] **Step 2: Run** `npx vitest run tests/powerCurve.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.** Add the constants and types, then `computePowerCurve` as a single pass collecting points and bin sums. Then do the fit and the bin deviation. Smooth the full arrays first, as `stats.ts` does.
- [ ] **Step 4: Run** `npx vitest run tests/powerCurve.test.ts && npm run check`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit**: `feat: compute difference-vs-power curve with bins and linear fit`

---

### Task 2: Pipeline integration

**Files:**
- Modify: `src/lib/pipeline.ts`, `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `computePowerCurve`, `PowerCurve` (Task 1).
- Produces: `Analysis.curve: PowerCurve | null`. It is non-null exactly when `stats` is non-null, and computed with `s.smoothingSec`.

- [ ] **Step 1: Write the failing tests** in `tests/pipeline.test.ts`:
  - `e2e curve`: the existing example-ride setup gives `curve` non-null, `curve.bins.length >= 10`, the first bin `centerW < 120`, the last bin `centerW > 250`, `curve.fit` non-null, and `curve.points.length === stats.durationSec`.
  - **Review Focus 3:** the same rides at `smoothingSec 1` vs `30` give different `curve.fit.slope` values (not equal).
  - **Review Focus 4:** the short-overlap case (existing test setup) gives `curve === null`.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**: add `curve` to `Analysis`, computed after `stats` in `analyze()`.
- [ ] **Step 4: Run** `npm test && npm run check`. Expected: all pass, 0 errors.
- [ ] **Step 5: Commit**: `feat: expose power curve in analysis`

---

### Task 3: Chart component

**Files:**
- Create: `src/components/PowerCurveChart.svelte`
- Modify: `src/components/Summary.svelte` (new prop `curve: PowerCurve | null`, chart mounted directly after the band table), `src/App.svelte` (pass `curve={analysis.curve}`), `src/app.css` (only if needed)

**Interfaces:**
- Consumes: `PowerCurve` (Task 1), `Analysis.curve` (Task 2), `formatW`, `formatPct`, `DIFF_PCT_MIN_METER_W`.
- Produces: `PowerCurveChart` with props `{ curve: PowerCurve }`. The W/% mode is internal component state, defaulting to `W`.

Behaviour:
- **Rendering:** render only when `curve` is non-null. One uPlot instance, ~260 px tall, its width following the container (`ResizeObserver` → `setSize`). It has no cursor sync with the time charts.
- **Title and toggle:** a title `Difference vs power` and a two-button toggle `W` | `%`, styled like the smoothing buttons. Use a neutral accent colour, not `--trainer` or `--meter`.
- **Points series:** the points sorted by `meterW` (uPlot needs ascending x). Points only, small (≈2 px), with a neutral token at low opacity and no line (`paths: () => null`). In % mode, use `diffPct` and drop nulls.
- **Bin means series:** one value at each bin `centerW` (nulls elsewhere, `spanGaps: true`), shown as a bold line with markers, `meanDiffW` or `meanDiffPct`.
- **Fit series:** a dashed thin line. In W mode it is `interceptW + slope × x` at the min and max x of the points. In % mode it is `(interceptW / x + slope) × 100`, sampled every 5 W from max(minX, 20) to maxX.
- **Zero line, axes, legend:** a zero line, an x-axis label `Power meter (W)`, and a y-axis label `Trainer − power meter (W)` or `(%)`. Legend values are formatted with `formatW` / `formatPct`.
- **Caption:** below the chart, exactly per Global Constraints.
- **Theme and cleanup:** recreate on `prefers-color-scheme` change and when `curve` or the mode changes. Destroy the plot, observer and listener on unmount. Follow the patterns in `PowerCharts.svelte`.

- [ ] **Step 1: Implement** the component, the Summary prop and mount, and the App wiring.
- [ ] **Step 2: Verify** `npm run check` (0 errors) and `npm test` (all pass).
- [ ] **Step 3: Verify in the browser.** Load both example rides and check:
  - the chart appears under the band table;
  - the points, bin line and dashed fit are visible;
  - the caption has numbers;
  - the % toggle switches the y units and the fit becomes a curve;
  - changing smoothing to 30 s changes the chart;
  - dark mode recreates it with the right colours;
  - at 375 px there is no horizontal scroll and no console errors.
  Take one screenshot.
- [ ] **Step 4: Commit**: `feat: difference-vs-power chart in summary`
