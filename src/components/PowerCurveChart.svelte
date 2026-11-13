<script lang="ts">
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import type { PowerCurve } from '../lib/types';
  import { buildCurveChart, type CurveMode } from '../lib/curveChart';
  import { formatPct, formatW } from '../lib/format';

  let { curve }: { curve: PowerCurve } = $props();

  const HEIGHT = 260;

  let mode: CurveMode = $state('W');
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
    const { data, yRange } = buildCurveChart(curve, mode);
    const opts: uPlot.Options = {
      width: Math.max(200, el.clientWidth),
      height: HEIGHT,
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: false }, y: { range: () => yRange } },
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
    plot = new uPlot(opts, data as uPlot.AlignedData, el);
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
