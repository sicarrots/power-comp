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

## Usage

1. Open `dist/index.html` in a browser (it works offline, straight from disk).
2. Load the smart-trainer FIT file into the first slot, then the power-meter FIT file into the second.
3. Check the automatic alignment and adjust the offset if needed.
4. Read the summary: average difference, statistics, power bands and warnings. Click a warning to zoom the charts to it.

Settings (thresholds, trim, smoothing) are remembered between visits; loaded files are not.

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
- `pipeline.ts` — analyze: align, overlap, smoothing, stats and anomalies in one pass
- `anomalies.ts` — spikes, dropouts, drift, power-dependent error, cadence mismatch
- `settings.ts` — Settings type and defaults (all thresholds in one place)
- `format.ts` — W / % / duration / clock-time formatting

## Deploy (Cloudflare)

The app is deployed as static assets with Wrangler (`wrangler.jsonc` uploads `dist/`).

- Build command: `npm run build`
- Deploy command: `npm run deploy` (builds, then runs `wrangler deploy`)

To deploy from your machine, run `npx wrangler login` once, then `npm run deploy`.
