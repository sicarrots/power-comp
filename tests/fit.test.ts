import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Encoder, Profile } from '@garmin/fitsdk';
import { parseFit, FitError } from '../src/lib/fit';

function load(name: string): ArrayBuffer {
  const b = readFileSync(`examples/${name}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('parseFit', () => {
  it('parses zwift-wahoo.fit', () => {
    const f = parseFit(load('zwift-wahoo.fit'), 'zwift-wahoo.fit');
    expect(f.records.length).toBe(7225);
    expect(f.meta.start.toISOString()).toBe('2026-11-11T16:41:14.000Z');
    expect(Math.round(f.meta.avgPower)).toBe(143);
    expect(f.meta.device).toContain('Zwift');
    expect(f.records.every((r) => Number.isInteger(r.t))).toBe(true);
  });

  it('parses garmin-favero.fit', () => {
    const f = parseFit(load('garmin-favero.fit'), 'garmin-favero.fit');
    expect(f.records.length).toBe(7208);
    expect(Math.round(f.meta.avgPower)).toBe(135);
    expect(f.meta.device).toBe('Edge 1040 · Favero');
  });

  it('rejects non-FIT data', () => {
    expect(() => parseFit(new Uint8Array([1, 2, 3, 4]).buffer, 'x.fit')).toThrow(FitError);
    expect(() => parseFit(new Uint8Array([1, 2, 3, 4]).buffer, 'x.fit')).toThrow("This doesn't look like a FIT file.");
  });

  it('rejects files without power', () => {
    const enc = new Encoder();
    enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'garmin', timeCreated: new Date(1e12) } as never);
    for (let i = 0; i < 3; i++) {
      enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(1e12 + i * 1000), heartRate: 120 + i } as never);
    }
    const u = enc.close();
    const ab = u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
    expect(() => parseFit(ab, 'x.fit')).toThrow('No power data found in this file.');
  });
});
