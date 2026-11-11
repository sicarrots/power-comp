<script lang="ts">
  import FileDrop from './components/FileDrop.svelte';
  import AlignControl from './components/AlignControl.svelte';
  import PowerCharts from './components/PowerCharts.svelte';
  import Summary from './components/Summary.svelte';
  import SettingsPanel from './components/Settings.svelte';
  import { parseFit, FitError } from './lib/fit';
  import { toSeries } from './lib/series';
  import { autoLag } from './lib/align';
  import { analyze, type Analysis } from './lib/pipeline';
  import { loadSettings, saveSettings, type Settings } from './lib/settings';
  import type { AlignResult, Anomaly, ParsedFile, Series } from './lib/types';

  let trainerFile = $state.raw<ParsedFile | null>(null);
  let meterFile = $state.raw<ParsedFile | null>(null);
  let trainerError = $state<string | null>(null);
  let meterError = $state<string | null>(null);
  let settings: Settings = $state(loadSettings());
  let auto = $state.raw<AlignResult | null>(null);
  let lagSec = $state(0);
  let charts: PowerCharts | undefined = $state();
  let chartsEl: HTMLDivElement | undefined = $state();

  $effect(() => saveSettings($state.snapshot(settings)));

  const trainerSeries: Series | null = $derived(
    trainerFile ? toSeries(trainerFile, settings.gapFillSec) : null,
  );
  const meterSeries: Series | null = $derived(
    meterFile ? toSeries(meterFile, settings.gapFillSec) : null,
  );

  const analysis: Analysis | null = $derived(
    trainerSeries && meterSeries && auto ? analyze(trainerSeries, meterSeries, lagSec, settings) : null,
  );

  const range = $derived(
    auto ? Math.max(Math.round(settings.searchWindowSec), Math.abs(auto.lagSec)) : 0,
  );

  function runAuto() {
    if (trainerSeries && meterSeries) {
      auto = autoLag(trainerSeries, meterSeries, settings);
      lagSec = auto.lagSec;
    } else {
      auto = null;
      lagSec = 0;
    }
  }

  async function load(slot: 'trainer' | 'meter', f: File) {
    let parsed: ParsedFile | null = null;
    let error: string | null = null;
    try {
      parsed = parseFit(await f.arrayBuffer(), f.name);
    } catch (e) {
      error = e instanceof FitError ? e.message : `Could not read this file: ${(e as Error).message}`;
    }
    if (slot === 'trainer') {
      trainerFile = parsed;
      trainerError = error;
    } else {
      meterFile = parsed;
      meterError = error;
    }
    runAuto();
  }

  function showAnomaly(a: Anomaly) {
    charts?.zoomTo(a.from, a.to);
    chartsEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function swap() {
    [trainerFile, meterFile] = [meterFile, trainerFile];
    [trainerError, meterError] = [meterError, trainerError];
    runAuto();
  }
</script>

<header class="app-header">
  <h1>Power Comp</h1>
  <p class="subtitle">Compare a smart trainer against a power meter from two FIT files of the same ride.</p>
</header>

<main>
  <section class="files" aria-label="Files">
    <FileDrop
      label="Smart trainer"
      variant="trainer"
      file={trainerFile}
      error={trainerError}
      onfile={(f) => load('trainer', f)}
    />
    <button
      type="button"
      class="swap"
      onclick={swap}
      disabled={!trainerFile && !meterFile && !trainerError && !meterError}
      aria-label="Swap files"
      title="Swap files">⇄</button
    >
    <FileDrop
      label="Power meter"
      variant="meter"
      file={meterFile}
      error={meterError}
      onfile={(f) => load('meter', f)}
    />
  </section>

  {#if auto && analysis}
    <AlignControl
      {auto}
      {lagSec}
      r={analysis.r}
      {range}
      onlag={(v) => (lagSec = v)}
      onrerun={runAuto}
    />

    <div bind:this={chartsEl}>
      <PowerCharts
        bind:this={charts}
        {analysis}
        smoothingSec={settings.smoothingSec}
        onsmoothing={(s) => (settings.smoothingSec = s)}
        anomalies={analysis.anomalies}
      />
    </div>

    <Summary
      stats={analysis.stats}
      overlap={analysis.overlap}
      anomalies={analysis.anomalies}
      onselect={showAnomaly}
    />
  {/if}

  <SettingsPanel {settings} onchange={(s) => (settings = s)} />
</main>
