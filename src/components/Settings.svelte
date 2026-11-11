<script lang="ts">
  import { DEFAULT_SETTINGS, type Settings } from '../lib/settings';

  let {
    settings,
    onchange,
  }: {
    settings: Settings;
    onchange: (s: Settings) => void;
  } = $props();

  const FIELDS: { key: keyof Settings; label: string; min: number; max?: number; step: number }[] = [
    { key: 'gapFillSec', label: 'Gap fill (s)', min: 0, step: 1 },
    { key: 'searchWindowSec', label: 'Alignment search window (s)', min: 1, step: 1 },
    { key: 'minCorrelation', label: 'Min. correlation (0–1)', min: 0, max: 1, step: 0.01 },
    { key: 'trimSec', label: 'Edge trim (s)', min: 0, step: 1 },
    { key: 'smoothingSec', label: 'Smoothing (s)', min: 1, step: 1 },
    { key: 'spikeAbsW', label: 'Spike threshold (W)', min: 0, step: 1 },
    { key: 'spikePct', label: 'Spike threshold (%)', min: 0, step: 1 },
    { key: 'dropoutMinW', label: 'Dropout min. power (W)', min: 0, step: 1 },
    { key: 'dropoutMinSec', label: 'Dropout min. duration (s)', min: 0, step: 1 },
    { key: 'driftPctPts', label: 'Drift threshold (pp)', min: 0, step: 1 },
    { key: 'bandSpreadPctPts', label: 'Power-band spread threshold (pp)', min: 0, step: 1 },
    { key: 'cadenceMedianRpm', label: 'Cadence median threshold (rpm)', min: 0, step: 1 },
    { key: 'cadenceRunRpm', label: 'Cadence run threshold (rpm)', min: 0, step: 1 },
  ];

  function update(f: (typeof FIELDS)[number], event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const raw = Number(el.value);
    if (el.value.trim() === '' || !Number.isFinite(raw)) {
      el.value = String(settings[f.key]);
      return;
    }
    let v = f.step === 1 ? Math.round(raw) : raw;
    v = Math.max(f.min, f.max === undefined ? v : Math.min(f.max, v));
    el.value = String(v);
    onchange({ ...settings, [f.key]: v });
  }
</script>

<details class="settings panel">
  <summary>Settings</summary>
  <div class="settings-grid">
    {#each FIELDS as f (f.key)}
      <label class="setting">
        <span>{f.label}</span>
        <input
          type="number"
          min={f.min}
          max={f.max}
          step={f.step}
          value={settings[f.key]}
          onchange={(e) => update(f, e)}
        />
      </label>
    {/each}
  </div>
  <button type="button" onclick={() => onchange({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
</details>
