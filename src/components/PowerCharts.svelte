<script lang="ts">
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import type { Analysis } from '../lib/pipeline';
  import type { Anomaly, Num } from '../lib/types';
  import { SMOOTHING_OPTIONS } from '../lib/settings';
  import { formatDuration } from '../lib/format';

  let {
    analysis,
    smoothingSec,
    onsmoothing,
    anomalies,
  }: {
    analysis: Analysis;
    smoothingSec: number;
    onsmoothing: (s: number) => void;
    anomalies: Anomaly[];
  } = $props();

  const SYNC_KEY = 'power-comp';
  const HEIGHT_POWER = 260;
  const HEIGHT_DIFF = 160;
  // Tick increments in seconds, so x-axis splits land on round durations.
  const X_INCRS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400];

  let container: HTMLDivElement | undefined = $state();
  let theme = $state(0); // bumped on prefers-color-scheme change to recreate plots

  // Plain (non-reactive) plot state.
  let plots: uPlot[] = [];
  let syncing = false;
  let zoom: { min: number; max: number } | null = null;
  let length = 0;

  interface Colors {
    trainer: string;
    meter: string;
    fg: string;
    muted: string;
    border: string;
    warn: string;
    panel: string;
  }

  function readColors(): Colors {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    return {
      trainer: v('--trainer'),
      meter: v('--meter'),
      fg: v('--fg'),
      muted: v('--muted'),
      border: v('--border'),
      warn: v('--warn'),
      panel: v('--panel'),
    };
  }

  function fmt(v: number | null | undefined, digits: number, unit: string): string {
    return v == null ? '—' : v.toFixed(digits) + unit;
  }

  function onSetScale(u: uPlot, key: string) {
    if (key !== 'x' || syncing) return;
    const { min, max } = u.scales.x;
    if (min == null || max == null) return;
    zoom = min <= 0 && max >= length - 1 ? null : { min, max };
    syncing = true;
    try {
      for (const p of plots) if (p !== u) p.setScale('x', { min, max });
    } finally {
      syncing = false;
    }
  }

  /** Grey out everything outside the overlap and tint the overlap itself. */
  function shadeOverlap(u: uPlot, c: Colors) {
    const ov = analysis.overlap;
    const { left, top, width, height } = u.bbox;
    const ctx = u.ctx;
    ctx.save();
    if (!ov || ov.to <= ov.from) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = c.muted;
      ctx.fillRect(left, top, width, height);
      ctx.restore();
      return;
    }
    const clamp = (x: number) => Math.max(left, Math.min(left + width, x));
    const x0 = clamp(u.valToPos(ov.from, 'x', true));
    const x1 = clamp(u.valToPos(ov.to - 1, 'x', true));
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = c.muted;
    if (x0 > left) ctx.fillRect(left, top, x0 - left, height);
    if (x1 < left + width) ctx.fillRect(x1, top, left + width - x1, height);
    if (x1 > x0) {
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = c.meter;
      ctx.fillRect(x0, top, x1 - x0, height);
    }
    ctx.restore();
  }

  function drawZeroLine(u: uPlot, c: Colors) {
    const { left, top, width, height } = u.bbox;
    const y = u.valToPos(0, 'y', true);
    if (y < top || y > top + height) return;
    const ctx = u.ctx;
    ctx.save();
    ctx.strokeStyle = c.muted;
    ctx.lineWidth = devicePixelRatio;
    ctx.setLineDash([4 * devicePixelRatio, 3 * devicePixelRatio]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAnomalyDots(u: uPlot, c: Colors, marks: Anomaly[], diffW: Num[]) {
    const xs = u.scales.x;
    if (xs.min == null || xs.max == null) return;
    const ctx = u.ctx;
    const r = 4 * devicePixelRatio;
    ctx.save();
    ctx.fillStyle = c.warn;
    ctx.strokeStyle = c.panel;
    ctx.lineWidth = 1.5 * devicePixelRatio;
    for (const a of marks) {
      if (a.from < xs.min || a.from > xs.max) continue;
      const px = u.valToPos(a.from, 'x', true);
      const py = u.valToPos(diffW[a.from] ?? 0, 'y', true);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function baseOpts(c: Colors, title: string, height: number, width: number): uPlot.Options {
    const axis = (extra: Partial<uPlot.Axis> = {}): uPlot.Axis => ({
      stroke: c.muted,
      grid: { stroke: c.border, width: 1 },
      ticks: { stroke: c.border, width: 1 },
      ...extra,
    });
    return {
      title,
      width,
      height,
      cursor: { sync: { key: SYNC_KEY }, drag: { x: true, y: false } },
      scales: { x: { time: false } },
      axes: [
        axis({
          incrs: X_INCRS,
          values: (_u, splits) => splits.map((s) => formatDuration(s)),
        }),
        axis(),
      ],
      series: [{ label: 'Time', value: (_u, v) => (v == null ? '—' : formatDuration(v)) }],
      hooks: {},
    };
  }

  function destroyPlots() {
    for (const p of plots) p.destroy();
    plots = [];
  }

  function createPlots(el: HTMLDivElement) {
    const c = readColors();
    const n = analysis.aligned.trainer.length;
    length = n;
    const x = Array.from({ length: n }, (_, i) => i);
    const { trainer, meter, diffW, diffPct } = analysis.smoothed;
    const width = Math.max(200, el.clientWidth);
    const marks = anomalies.filter((a) => a.kind === 'spike' || a.kind === 'dropout');
    const shade = (u: uPlot) => shadeOverlap(u, c);

    const power = baseOpts(c, 'Power (W)', HEIGHT_POWER, width);
    power.series.push(
      { label: 'Trainer', stroke: c.trainer, width: 1.5, value: (_u, v) => fmt(v, 0, ' W') },
      { label: 'Meter', stroke: c.meter, width: 1.5, value: (_u, v) => fmt(v, 0, ' W') },
    );
    power.hooks = { drawClear: [shade], setScale: [onSetScale] };

    const diff = baseOpts(c, 'Difference (W)', HEIGHT_DIFF, width);
    diff.series.push({
      label: 'Trainer − meter',
      stroke: c.fg,
      width: 1,
      value: (_u, v) => fmt(v, 1, ' W'),
    });
    diff.hooks = {
      drawClear: [shade, (u) => drawZeroLine(u, c)],
      draw: [(u) => drawAnomalyDots(u, c, marks, diffW)],
      setScale: [onSetScale],
    };

    const pct = baseOpts(c, 'Difference (%)', HEIGHT_DIFF, width);
    pct.series.push({
      label: 'Trainer vs meter',
      stroke: c.fg,
      width: 1,
      value: (_u, v) => fmt(v, 1, '%'),
    });
    pct.hooks = { drawClear: [shade, (u) => drawZeroLine(u, c)], setScale: [onSetScale] };

    const restore = zoom && zoom.max <= n - 1 ? zoom : null;
    syncing = true;
    try {
      plots = [
        new uPlot(power, [x, trainer, meter], el),
        new uPlot(diff, [x, diffW], el),
        new uPlot(pct, [x, diffPct], el),
      ];
    } finally {
      syncing = false;
    }
    zoom = null;
    if (restore) plots[0].setScale('x', restore);
  }

  export function zoomTo(from: number, to: number): void {
    if (plots.length === 0) return;
    const span = Math.max(1, to - from);
    const pad = span * 0.1;
    const min = Math.max(0, from - pad);
    const max = Math.min(length - 1, to + pad);
    if (max <= min) return;
    plots[0].setScale('x', { min, max });
  }

  // (Re)create plots whenever the analysis, anomalies or colour scheme change.
  $effect(() => {
    const el = container;
    void theme;
    void analysis;
    void anomalies;
    if (!el) return;
    createPlots(el);
    return destroyPlots;
  });

  // Follow container width and colour-scheme changes.
  $effect(() => {
    const el = container;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const width = Math.max(200, el.clientWidth);
      for (const p of plots) p.setSize({ width, height: p.height });
    });
    ro.observe(el);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => theme++;
    mq.addEventListener('change', onScheme);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', onScheme);
    };
  });
</script>

<section class="charts panel" aria-label="Charts">
  <div class="smoothing" role="group" aria-label="Smoothing">
    <span class="smoothing-label">Smoothing</span>
    {#each SMOOTHING_OPTIONS as s (s)}
      <button
        type="button"
        class:active={s === smoothingSec}
        aria-pressed={s === smoothingSec}
        onclick={() => onsmoothing(s)}>{s} s</button
      >
    {/each}
    <span class="chart-hint">Drag to zoom · double-click to reset</span>
  </div>
  <div class="plots" bind:this={container}></div>
</section>
