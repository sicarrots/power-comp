<script lang="ts">
  import type { ParsedFile } from '../lib/types';
  import { formatClock, formatDuration, formatW } from '../lib/format';

  let {
    label,
    file,
    error,
    onfile,
    variant = 'trainer',
  }: {
    label: string;
    file: ParsedFile | null;
    error: string | null;
    onfile: (f: File) => void;
    variant?: 'trainer' | 'meter';
  } = $props();

  let input: HTMLInputElement;
  let dragging = $state(false);

  function pick(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const f = el.files?.[0];
    el.value = '';
    if (f) onfile(f);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const f = event.dataTransfer?.files?.[0];
    if (f) onfile(f);
  }

  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  }
</script>

<div
  class="drop {variant}"
  class:dragging
  class:has-error={!!error}
  role="button"
  tabindex="0"
  aria-label="{label}: choose or drop a .fit file"
  onclick={() => input.click()}
  onkeydown={keydown}
  ondragover={(e) => { e.preventDefault(); dragging = true; }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
>
  <div class="slot-label">{label}</div>
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}
  {#if file}
    <div class="file-name" title={file.meta.fileName}>{file.meta.fileName}</div>
    <dl class="meta">
      <dt>Device</dt><dd>{file.meta.device}</dd>
      <dt>Start</dt><dd>{formatClock(file.meta.start)}</dd>
      <dt>Duration</dt><dd>{formatDuration(file.meta.durationSec)}</dd>
      <dt>Avg power</dt><dd>{formatW(file.meta.avgPower)}</dd>
    </dl>
  {:else if !error}
    <p class="hint">Drop a .fit file here or click to choose</p>
  {/if}
  <input bind:this={input} type="file" accept=".fit" hidden onchange={pick} />
</div>
