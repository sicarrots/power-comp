<script lang="ts">
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import type { PowerCurve } from '../lib/types';
  import { DIFF_PCT_MIN_METER_W } from '../lib/settings';
  import { formatPct, formatW } from '../lib/format';

  let { curve }: { curve: PowerCurve } = $props();

  type Mode = 'W' | '%';
  const HEIGHT = 260;
  const FIT_STEP_W = 5;

  let mode: Mode = $state('W');
  let container: HTMLDivElement | undefined = $state();
  let theme = $state(0); // bumped on prefers-color-scheme change to recreate the plot
  let plot: uPlot | null = null;

  const caption = $derived.by(() => {
    const f = curve.fit;
    if (!f) return 'Not enough data for a straight-line fit.';
    const sign = f.slope < 0 ? '−' : '+';
    const line = `Difference ≈ ${formatW(f.interceptW, true)} ${sign} ${formatPct(Math.abs(f.slope) * 100)} of power`;
    const dev =
      f.maxBinDeviationW === null || f.maxBinDeviationAtW === null
        ? 'bins depart from the line by up to —'
        : `bins depart from the line by up to ${formatW(f.maxBinDeviationW)} (at ${Math.round(f.maxBinDeviationAtW)} W)`;
    return `${line} · ${dev}`;
  });

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    return { fg: v('--fg'), muted: v('--muted'), border: v('--border') };
  }

  /**
   * uPlot needs one ascending x array shared by all series, so points, bin means and
   * the fitted line are merged onto it with nulls where a series has no value.
   */
  function buildData(m: Mode): uPlot.AlignedData {
    const rows: [number, number, 0 | 1 | 2][] = [];
    for (const p of curve.points) {
      const y = m === 'W' ? p.diffW : p.diffPct;
      if (y !== null) rows.push([p.meterW, y, 0]);
    }
    for (const b of curve.bins) {
      const y = m === 'W' ? b.meanDiffW : b.meanDiffPct;
      if (y !== null) rows.push([b.meanMeterW, y, 1]);
    }
    const f = curve.fit;
    if (f && curve.points.length) {
      let lo = Infinity, hi = -Infinity;
      for (const p of curve.points) { lo = Math.min(lo, p.meterW); hi = Math.max(hi, p.meterW); }
      if (m === 'W') {
        rows.push([lo, f.interceptW + f.slope * lo, 2], [hi, f.interceptW + f.slope * hi, 2]);
      } else {
        for (let x = Math.max(lo, DIFF_PCT_MIN_METER_W); x <= hi; x += FIT_STEP_W) {
          rows.push([x, (f.interceptW / x + f.slope) * 100, 2]);
        }
      }
    }
    rows.sort((a, b) => a[0] - b[0]);
    const xs: number[] = [];
    const ys: (number | null)[][] = [[], [], []];
    for (const [x, y, s] of rows) {
      xs.push(x);
      for (let k = 0; k < 3; k++) ys[k].push(k === s ? y : null);
    }
    return [xs, ...ys];
  }

  function create(el: HTMLDivElement) {
    const c = readColors();
    const fmtY = (v: number | null | undefined) =>
      v == null ? '—' : mode === 'W' ? formatW(v, true) : formatPct(v, true);
    const axis = (extra: Partial<uPlot.Axis> = {}): uPlot.Axis => ({
      stroke: c.muted,
      grid: { stroke: c.border, width: 1 },
      ticks: { stroke: c.border, width: 1 },
      ...extra,
    });
    const zeroLine = (u: uPlot) => {
      const { left, top, width, height } = u.bbox;
      const y = u.valToPos(0, 'y', true);
      if (y < top || y > top + height) return;
      const ctx = u.ctx;
      ctx.save();
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = devicePixelRatio;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.restore();
    };
    const opts: uPlot.Options = {
      width: Math.max(200, el.clientWidth),
      height: HEIGHT,
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false } },
      axes: [
        axis({ label: 'Power meter (W)', values: (_u, s) => s.map((v) => `${v} W`) }),
        axis({ label: `Trainer − power meter (${mode})`, size: 60 }),
      ],
      series: [
        { label: 'Meter power', value: (_u, v) => (v == null ? '—' : `${Math.round(v)} W`) },
        {
          label: 'Seconds',
          stroke: c.muted,
          alpha: 0.35,
          paths: () => null,
          points: { show: true, size: 3, fill: c.muted, stroke: c.muted, width: 0 },
          value: (_u, v) => fmtY(v),
        },
        {
          label: `Mean per 10 W`,
          stroke: c.fg,
          width: 2.5,
          spanGaps: true,
          points: { show: true, size: 6, fill: c.fg, stroke: c.fg },
          value: (_u, v) => fmtY(v),
        },
        {
          label: 'Straight line',
          stroke: c.fg,
          width: 1,
          dash: [6, 4],
          spanGaps: true,
          points: { show: false },
          value: (_u, v) => fmtY(v),
        },
      ],
      hooks: { drawClear: [zeroLine] },
    };
    plot = new uPlot(opts, buildData(mode), el);
  }

  $effect(() => {
    const el = container;
    void curve;
    void mode;
    void theme;
    if (!el) return;
    create(el);
    return () => {
      plot?.destroy();
      plot = null;
    };
  });

  $effect(() => {
    const el = container;
    if (!el) return;
    const ro = new ResizeObserver(() => plot?.setSize({ width: Math.max(200, el.clientWidth), height: HEIGHT }));
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

<section class="curve" aria-label="Difference vs power">
  <div class="smoothing curve-head">
    <h3 class="curve-title">Difference vs power</h3>
    <div class="curve-toggle" role="group" aria-label="Units">
      {#each ['W', '%'] as const as m (m)}
        <button type="button" class:active={mode === m} aria-pressed={mode === m} onclick={() => (mode = m)}>{m}</button>
      {/each}
    </div>
  </div>
  <div class="curve-plot" bind:this={container}></div>
  <p class="curve-caption">{caption}</p>
</section>
