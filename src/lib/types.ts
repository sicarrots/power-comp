export type Num = number | null;
export interface FileMeta { fileName: string; device: string; start: Date; durationSec: number; avgPower: number }
export interface FitRecord { t: number /* unix s, integer */; power: Num; cadence: Num }
export interface ParsedFile { meta: FileMeta; records: FitRecord[] }
export interface Series { start: number; power: Num[]; cadence: Num[] } // 1 s grid
export interface Aligned { start: number; trainer: Num[]; meter: Num[]; trainerCad: Num[]; meterCad: Num[] }
export interface AlignResult { lagSec: number; r: number; method: 'timestamp-window' | 'full-search'; lowConfidence: boolean }
export interface Overlap { from: number; to: number /* exclusive */; tooShort: boolean }
export interface Extreme { w: number; pct: number; t: number }
export interface Band { label: string; min: number; max: number | null; seconds: number; meanDiffW: number; meanDiffPct: number | null }
export interface Stats {
  durationSec: number; meanTrainerW: number; meanMeterW: number; meanDiffW: number; meanDiffPct: number;
  meanAbsDiffW: number; sdDiffW: number; maxPos: Extreme; maxNeg: Extreme; bands: Band[];
}
export type AnomalyKind = 'spike' | 'dropout' | 'drift' | 'power-dependent' | 'cadence';
export interface Anomaly { kind: AnomalyKind; severity: 'info' | 'warning'; from: number; to: number; message: string }
