import { describe, it, expect } from 'vitest';
import { detectAnomalies } from '../src/lib/anomalies';
import { computeStats } from '../src/lib/stats';
import { DEFAULT_SETTINGS } from '../src/lib/settings';
import type { Aligned, Anomaly, Num, Overlap } from '../src/lib/types';
import { ridePower } from './helpers';

const N = 3600;
const full = (n: number): Overlap => ({ from: 0, to: n, tooShort: false });

function al(trainer: Num[], meter: Num[], trainerCad?: Num[], meterCad?: Num[]): Aligned {
  return {
    start: 0, trainer, meter,
    trainerCad: trainerCad ?? trainer.map(() => 90),
    meterCad: meterCad ?? meter.map(() => 90),
  };
}

function run(a: Aligned, ov: Overlap = full(a.meter.length)): Anomaly[] {
  return detectAnomalies(a, ov, computeStats(a, ov, 3), DEFAULT_SETTINGS);
}

const kinds = (xs: Anomaly[], k: Anomaly['kind']) => xs.filter((x) => x.kind === k);

function base(): { meter: number[]; trainer: number[] } {
  const meter = ridePower(N);
  return { meter, trainer: meter.map((m) => m * 1.05) };
}

describe('detectAnomalies', () => {
  it('clean data → no anomalies', () => {
    const { meter, trainer } = base();
    expect(run(al(trainer, meter))).toEqual([]);
  });

  describe('spike', () => {
    it('single second +150 W at 200 W → one warning spike', () => {
      const { meter, trainer } = base();
      meter[1000] = 200; trainer[1000] = 350;
      const sp = kinds(run(al(trainer, meter)), 'spike');
      expect(sp).toHaveLength(1);
      expect(sp[0]).toMatchObject({ severity: 'warning', from: 1000, to: 1001 });
      expect(sp[0].message).toBe('Spike: trainer +150.0 W vs power meter (+75.0%)');
    });

    it('two spikes 3 s apart merge into one event', () => {
      const { meter, trainer } = base();
      for (const i of [1000, 1003]) { meter[i] = 200; trainer[i] = 350; }
      const sp = kinds(run(al(trainer, meter)), 'spike');
      expect(sp).toHaveLength(1);
      expect(sp[0]).toMatchObject({ from: 1000, to: 1004 });
    });

    it('two spikes 10 s apart → two events', () => {
      const { meter, trainer } = base();
      for (const i of [1000, 1010]) { meter[i] = 200; trainer[i] = 350; }
      const sp = kinds(run(al(trainer, meter)), 'spike');
      expect(sp).toHaveLength(2);
      expect(sp.map((s) => s.from)).toEqual([1000, 1010]);
    });

    it('message sign follows the largest |diff| in the event', () => {
      const { meter, trainer } = base();
      meter[1000] = 200; trainer[1000] = 350;
      meter[1002] = 400; trainer[1002] = 150;
      const sp = kinds(run(al(trainer, meter)), 'spike');
      expect(sp).toHaveLength(1);
      expect(sp[0].message).toBe('Spike: trainer −250.0 W vs power meter (−62.5%)');
    });

    it('meter 0, trainer 30 → no spike (below absolute threshold)', () => {
      const { meter, trainer } = base();
      meter[1000] = 0; trainer[1000] = 30;
      expect(kinds(run(al(trainer, meter)), 'spike')).toEqual([]);
    });

    it('meter 10, trainer 120 → spike (110 W and > 50%)', () => {
      const { meter, trainer } = base();
      meter[1000] = 10; trainer[1000] = 120;
      expect(kinds(run(al(trainer, meter)), 'spike')).toHaveLength(1);
    });
  });

  describe('dropout', () => {
    it('meter 0 for 5 s while trainer ~200 → one dropout, no spike', () => {
      const { meter, trainer } = base();
      for (let i = 2000; i < 2005; i++) { meter[i] = 0; trainer[i] = 200; }
      const res = run(al(trainer, meter));
      const d = kinds(res, 'dropout');
      expect(d).toHaveLength(1);
      expect(d[0]).toMatchObject({ severity: 'warning', from: 2000, to: 2005 });
      expect(d[0].message).toBe('Dropout: power meter read 0 W for 0:05 while the other read 200.0 W avg');
      expect(kinds(res, 'spike')).toEqual([]);
    });

    it('trainer null for 3 s → trainer dropout', () => {
      const { meter, trainer } = base();
      const t: Num[] = trainer.slice();
      for (let i = 2000; i < 2003; i++) { t[i] = null; meter[i] = 180; }
      const d = kinds(run(al(t, meter)), 'dropout');
      expect(d).toHaveLength(1);
      expect(d[0]).toMatchObject({ from: 2000, to: 2003 });
      expect(d[0].message).toBe('Dropout: trainer read 0 W for 0:03 while the other read 180.0 W avg');
    });

    it('1 s only → no dropout', () => {
      const { meter, trainer } = base();
      meter[2000] = 0; trainer[2000] = 200;
      expect(kinds(run(al(trainer, meter)), 'dropout')).toEqual([]);
    });
  });

  describe('drift', () => {
    const drifted = (k: number) => {
      const meter = ridePower(N);
      return al(meter.map((m, t) => m * (1.03 + k * t / N)), meter);
    };

    it('6 pp linear drift → warning drift spanning the overlap', () => {
      const d = kinds(run(drifted(0.06)), 'drift');
      expect(d).toHaveLength(1);
      expect(d[0].message).toMatch(/from \+(2\.9|3\.0|3\.1)% to \+(8\.9|9\.0|9\.1)%/);
      expect(d[0].message).toMatch(/over 1:00:00$/);
      expect(d[0]).toMatchObject({ severity: 'warning', from: 0, to: N });
    });

    it('3.5 pp drift → info', () => {
      const d = kinds(run(drifted(0.035)), 'drift');
      expect(d).toHaveLength(1);
      expect(d[0].severity).toBe('info');
    });

    it('constant ratio → no drift', () => {
      expect(kinds(run(drifted(0)), 'drift')).toEqual([]);
      const { meter, trainer } = base();
      expect(kinds(run(al(trainer, meter)), 'drift')).toEqual([]);
    });

    it('blocks with meter mean < 50 W are ignored', () => {
      const { meter, trainer } = base();
      for (let i = 0; i < 600; i++) { meter[i] = 30; trainer[i] = 45; }
      expect(kinds(run(al(trainer, meter)), 'drift')).toEqual([]);
    });
  });

  describe('power-dependent', () => {
    it('+10% below 150 W, +2% above 250 W → info', () => {
      const meter: number[] = [], trainer: number[] = [];
      for (let i = 0; i < N; i++) {
        const hi = Math.floor(i / 120) % 2 === 1;
        meter.push(hi ? 300 : 120);
        trainer.push(hi ? 306 : 132);
      }
      const p = kinds(run(al(trainer, meter)), 'power-dependent');
      expect(p).toHaveLength(1);
      expect(p[0]).toMatchObject({ severity: 'info', from: 0, to: N });
      expect(p[0].message).toMatch(/^Difference depends on power: \+\d+\.\d% at <150 W vs \+\d+\.\d% at 250–350 W$/);
    });
  });

  describe('cadence', () => {
    it('+5 rpm offset everywhere → median finding', () => {
      const { meter, trainer } = base();
      const c = kinds(run(al(trainer, meter, meter.map(() => 95), meter.map(() => 90))), 'cadence');
      expect(c).toHaveLength(1);
      expect(c[0]).toMatchObject({ severity: 'info', from: 0, to: N });
      expect(c[0].message).toBe('Cadence differs by 5 rpm (median) — check alignment or cadence sensor');
    });

    it('+15 rpm for 12 s only → run finding', () => {
      const { meter, trainer } = base();
      const tc = meter.map((_, i) => (i >= 1500 && i < 1512 ? 105 : 90));
      const c = kinds(run(al(trainer, meter, tc, meter.map(() => 90))), 'cadence');
      expect(c).toHaveLength(1);
      expect(c[0]).toMatchObject({ severity: 'info', from: 1500, to: 1512 });
      expect(c[0].message).toBe('Cadence differs by more than 10 rpm for 0:12');
    });

    it('cadence array all null → no cadence findings', () => {
      const { meter, trainer } = base();
      const c = kinds(run(al(trainer, meter, meter.map(() => 120), meter.map(() => null))), 'cadence');
      expect(c).toEqual([]);
    });
  });

  it('results are sorted by from', () => {
    const { meter, trainer } = base();
    meter[3000] = 200; trainer[3000] = 350;
    for (let i = 2000; i < 2005; i++) { meter[i] = 0; trainer[i] = 200; }
    const res = run(al(trainer, meter));
    expect(res.map((r) => r.from)).toEqual([...res.map((r) => r.from)].sort((x, y) => x - y));
    expect(res.map((r) => r.kind)).toEqual(['dropout', 'spike']);
  });
});
