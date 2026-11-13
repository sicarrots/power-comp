# Difference vs power chart: short design

Date: 2026-11-13
Status: awaiting approval
Size: small change

## Intent

The user wants to see whether the trainer and power-meter difference is **linear across the whole power range of the ride** or changes with load. That means using every sample, not only the four fixed bands (<150, 150–250, 250–350, >350 W) in the summary table. Example question: "at 100 W the trainer differs by 5 W, at 200 W by 1 W. Is that a straight line?"

## Goals / non-goals / anti-goals

- **Goal:** one chart that answers "is the difference linear in power?" at a glance, backed by every usable second of the ride.
- **Non-goals:** correcting the data, exporting coefficients, new settings in the UI, changing the existing band table or warnings.
- **Anti-goal:** a chart where a handful of seconds at an unusual power look as trustworthy as an hour at 150 W.

## Approaches

- **A. Scatter + binned mean line + fitted straight line.** Chosen by the user. Shows the shape, the amount of data behind it, and a straight-line reference in one view.
- B. Binned means with a spread band only. Cleaner, but it hides how much data each point rests on.
- C. Scatter only. Simplest, but the trend is lost in ~7,000 noisy points.

## Design

**What the user sees.** A new chart in the summary, below the band table, titled "Difference vs power":

```
 Difference (W)                          [ W | % ]
  +15 ┤        ·  ·
  +10 ┤   · ·:·::·:· ·      ·
   +5 ┤ ━━━●━━●━━●━━●━━●━━━●━━━━●      ← mean per 10 W bin (bold)
    0 ┼─────────────────────────────── ← zero line
   −5 ┤  ·  · ::·:··  · ·     ── ── ── ← fitted straight line (thin, dashed)
      └──┬────┬────┬────┬────┬────┬──
        80  120  160  200  240  280   Power meter (W)
 Difference ≈ +2.1 W + 3.4% of power · bins depart from the line by up to 1.8 W (at 270 W)
```

- **X axis:** smoothed power-meter power (W). This matches the band table.
- **Y axis:** difference = trainer − power meter. This is the same sign as everywhere else in the app. A W | % toggle switches the y axis. In % mode, seconds with meter power below 20 W (`DIFF_PCT_MIN_METER_W`) are left out, and the fitted line is drawn as its % curve.
- **Points:** one faint dot per usable second, in a neutral colour.
- **Bin means:** a bold line with markers at the mean difference of each 10 W bin of meter power, at the bin centre. Bins with fewer than 30 seconds are omitted.
- **Fitted line:** least squares over all usable seconds, `diffW = a + b · meterW`. It's drawn thin and dashed across the data's power range.
- **Caption:** `Difference ≈ {a W} + {b·100 %} of power · bins depart from the line by up to {max |binMean − fit(binCentre)| W} (at {that bin's centre} W)`. The second half is the direct answer to the linearity question. The caption shows "—" when there are fewer than 2 bins.

**Data.** The chart uses exactly the seconds the stats use: inside the overlap, at the selected smoothing, with both smoothed values present, and excluding seconds where both raw values are 0. It follows the alignment lag, smoothing and trim like everything else. It's hidden whenever the stats are hidden (no overlap, or too short).

**Structure.**
- `src/lib/powerCurve.ts` (new, pure, unit-tested): `computePowerCurve(a: Aligned, ov: Overlap, smoothingSec: number): PowerCurve`. It returns the points `{meterW, diffW, diffPct | null}[]`, the bins `{centerW, seconds, meanDiffW, meanDiffPct | null}[]`, and the fit `{interceptW, slope, maxBinDeviationW, maxBinDeviationAtW} | null`.
- **Constants** in `settings.ts`: `CURVE_BIN_W = 10` and `CURVE_MIN_BIN_SEC = 30`.
- `pipeline.ts`: `Analysis` gains `curve: PowerCurve | null`, which is null exactly when `stats` is null.
- `src/components/PowerCurveChart.svelte` (new): a uPlot chart with points-only, line+markers and dashed series. It isn't synced with the time charts, and it recreates on theme change like `PowerCharts`. It's mounted in `Summary.svelte` under the band table.

**Tests.**
- Synthetic `trainer = meter × 1.05 + 2` gives a fit with intercept ≈ 2 W, slope ≈ 0.05, and max bin deviation ≈ 0.
- A non-linear case (+10% below 150 W, +2% above 250 W) gives a max bin deviation clearly above 0.
- Sparse bins (< 30 s) are dropped.
- Both-zero seconds are excluded.
- End-to-end on the example rides: the curve is non-null and has bins between ~80 and ~300 W.
- The chart is checked in the browser with the example rides.

## Left to the builder

Point size, opacity and colours (use existing tokens, with a neutral colour for points), the chart height (~260 px), and axis tick formatting.
