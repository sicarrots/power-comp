# Power Comp

Offline single-file browser app that compares power readings from a smart-trainer FIT file and a power-meter FIT file recorded during the same ride.

## Commands

```
npm install
npm run dev     # live preview
npm test        # calculation tests
npm run check   # type check
npm run build   # → dist/index.html
```

## How it works

Load the smart-trainer file into the first slot and the power-meter file into the second. The app aligns the two recordings in time automatically (cross-correlation lag search), then lets you adjust the offset manually. For the longest common segment it reports how far the trainer deviates from the power meter and warns about unusual readings. Everything runs in the browser; no data leaves your machine.

## `src/lib` modules

- `types.ts` — shared types
- `fit.ts` — FIT bytes to parsed file (meta + power/cadence records)
- `series.ts` — resample to a 1 s grid, fill short gaps
- `smooth.ts` — null-aware rolling mean
- `align.ts` — cross-correlation lag search and lag application
- `overlap.ts` — longest common segment after lag, minus trim
- `stats.ts` — differences, extremes, power-band breakdown
- `anomalies.ts` — spikes, dropouts, drift, power-dependent error, cadence mismatch
- `settings.ts` — Settings type and defaults (all thresholds in one place)
- `format.ts` — W / % / duration / clock-time formatting
