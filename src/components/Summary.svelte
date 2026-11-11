<script lang="ts">
  import type { Anomaly, Num, Overlap, Stats } from '../lib/types';
  import { DIFF_PCT_MIN_METER_W } from '../lib/settings';
  import { formatDuration, formatPct, formatW } from '../lib/format';

  let {
    stats,
    overlap,
    anomalies,
    smoothedMeter,
    onselect,
  }: {
    stats: Stats | null;
    overlap: Overlap | null;
    anomalies: Anomaly[];
    smoothedMeter: Num[];
    onselect: (a: Anomaly) => void;
  } = $props();

  const meanPctOk = $derived(stats !== null && stats.meanMeterW >= DIFF_PCT_MIN_METER_W);
  const posShown = $derived(stats !== null && stats.maxPos.w > 0);
  const negShown = $derived(stats !== null && stats.maxNeg.w < 0);
  function extremePct(e: { pct: number; t: number }): string {
    const m = smoothedMeter[e.t];
    return m === null || m === undefined || m < DIFF_PCT_MIN_METER_W ? '—' : formatPct(e.pct, true);
  }

  const usable = $derived(stats !== null && overlap !== null && !overlap.tooShort);
</script>

<section class="summary panel" aria-label="Summary">
  {#if !usable || !stats}
    <p class="banner warn" role="alert">
      Not enough overlapping data to compare (need at least 5 minutes after trimming). Check the alignment or the files.
    </p>
  {:else}
    <h2 class="headline">
      Trainer reads {meanPctOk ? formatPct(stats.meanDiffPct, true) : '—'} ({formatW(stats.meanDiffW, true)}) vs power meter over {formatDuration(
        stats.durationSec,
      )}
    </h2>

    <div class="summary-grid">
      <table class="stats-table">
        <caption>Statistics</caption>
        <tbody>
          <tr><th scope="row">Avg trainer</th><td>{formatW(stats.meanTrainerW)}</td></tr>
          <tr><th scope="row">Avg power meter</th><td>{formatW(stats.meanMeterW)}</td></tr>
          <tr><th scope="row">Avg difference (W)</th><td>{formatW(stats.meanDiffW, true)}</td></tr>
          <tr><th scope="row">Avg difference (%)</th><td>{meanPctOk ? formatPct(stats.meanDiffPct, true) : '—'}</td></tr>
          <tr><th scope="row">Mean absolute difference</th><td>{formatW(stats.meanAbsDiffW)}</td></tr>
          <tr><th scope="row">Std. deviation of difference</th><td>{formatW(stats.sdDiffW)}</td></tr>
          <tr>
            <th scope="row">Max positive deviation</th>
            <td>
              {#if posShown}
                {formatW(stats.maxPos.w, true)}, {extremePct(stats.maxPos)}
                <span class="at">at {formatDuration(stats.maxPos.t)}</span>
              {:else}
                —
              {/if}
            </td>
          </tr>
          <tr>
            <th scope="row">Max negative deviation</th>
            <td>
              {#if negShown}
                {formatW(stats.maxNeg.w, true)}, {extremePct(stats.maxNeg)}
                <span class="at">at {formatDuration(stats.maxNeg.t)}</span>
              {:else}
                —
              {/if}
            </td>
          </tr>
        </tbody>
      </table>

      <table class="bands-table">
        <caption>By power band (power meter)</caption>
        <thead>
          <tr>
            <th scope="col">Band</th>
            <th scope="col">Time in band</th>
            <th scope="col">Avg diff (W)</th>
            <th scope="col">Avg diff (%)</th>
          </tr>
        </thead>
        <tbody>
          {#each stats.bands as b (b.label)}
            <tr>
              <th scope="row">{b.label}</th>
              <td>{formatDuration(b.seconds)}</td>
              <td>{b.seconds ? formatW(b.meanDiffW, true) : '–'}</td>
              <td>{b.meanDiffPct === null ? '–' : formatPct(b.meanDiffPct, true)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h3 class="warnings-title">Warnings</h3>
    {#if anomalies.length === 0}
      <p class="hint">No unusual readings found.</p>
    {:else}
      <ul class="warnings">
        {#each anomalies as a, i (i)}
          <li>
            <button type="button" class="warning sev-{a.severity}" onclick={() => onselect(a)} title="Show in charts">
              <span class="icon" aria-label={a.severity === 'warning' ? 'Warning' : 'Info'}
                >{a.severity === 'warning' ? '⚠' : 'ℹ'}</span
              >
              <span class="message">{a.message}</span>
              <span class="time">{formatDuration(a.from)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>
