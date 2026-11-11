<script lang="ts">
  import type { AlignResult } from '../lib/types';

  let {
    auto,
    lagSec,
    r,
    onlag,
    onrerun,
    range,
  }: {
    auto: AlignResult;
    lagSec: number;
    r: number | null;
    onlag: (lag: number) => void;
    onrerun: () => void;
    range: number;
  } = $props();

  const MINUS = '−';

  function signedInt(n: number): string {
    if (n < 0) return MINUS + Math.abs(n);
    return n > 0 ? '+' + n : '0';
  }

  const methodText = $derived(auto.method === 'full-search' ? 'full search' : 'timestamp window');

  function set(v: number) {
    if (!Number.isFinite(v)) return;
    onlag(Math.max(-range, Math.min(range, Math.round(v))));
  }

  function fromInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    // Accept U+2212 as a minus sign too.
    const v = Number(el.value.replace(MINUS, '-'));
    if (el.value.trim() === '' || !Number.isFinite(v)) {
      el.value = String(lagSec);
      return;
    }
    set(v);
    el.value = String(Math.max(-range, Math.min(range, Math.round(v))));
  }
</script>

<section class="align panel" aria-label="Alignment">
  <div class="align-head">
    <span class="auto">Auto: {signedInt(auto.lagSec)} s, r = {auto.r.toFixed(2)} ({methodText})</span>
    <span class="current" aria-live="polite">Current: r = {r === null ? '–' : r.toFixed(2)}</span>
  </div>
  {#if auto.lowConfidence}
    <p class="banner warn" role="alert">Low confidence — these may not be the same ride.</p>
  {/if}
  <div class="align-row">
    <label class="slider">
      <span class="sr-only">Lag (seconds)</span>
      <input
        type="range"
        min={-range}
        max={range}
        step="1"
        value={lagSec}
        oninput={(e) => set(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
    <div class="align-buttons">
      <button type="button" onclick={() => set(lagSec - 1)} aria-label="Lag minus one second">{MINUS}1</button>
      <label class="lag-input">
        <input type="number" min={-range} max={range} step="1" value={lagSec} onchange={fromInput} aria-label="Lag in seconds" />
        <span>s</span>
      </label>
      <button type="button" onclick={() => set(lagSec + 1)} aria-label="Lag plus one second">+1</button>
      <button type="button" onclick={onrerun}>Re-run auto</button>
    </div>
  </div>
</section>
