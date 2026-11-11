import { expect, test } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/lib/settings';

function fakeStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

test('null storage gives defaults', () => {
  expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
});

test('keeps only known finite numeric keys', () => {
  const s = fakeStorage({ 'power-comp/settings': '{"spikeAbsW":150,"bogus":1,"trimSec":"x"}' });
  const out = loadSettings(s);
  expect(out.spikeAbsW).toBe(150);
  expect(out.trimSec).toBe(30);
  expect('bogus' in out).toBe(false);
});

test('throwing storage gives defaults', () => {
  const s = { getItem() { throw new Error('nope'); } } as unknown as Storage;
  expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
});

test('save then load round-trips', () => {
  const s = fakeStorage();
  saveSettings({ ...DEFAULT_SETTINGS, trimSec: 45 }, s);
  expect(loadSettings(s).trimSec).toBe(45);
});
