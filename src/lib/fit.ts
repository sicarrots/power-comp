import { Decoder, Stream } from '@garmin/fitsdk';
import type { FitRecord, ParsedFile } from './types';

export class FitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FitError';
  }
}

const NOT_FIT = "This doesn't look like a FIT file.";
const NO_POWER = 'No power data found in this file.';

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function prettyProduct(s: string): string {
  return s
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(cap)
    .join(' ');
}

function prettyMaker(s: string, stripElectronics = false): string {
  let v = s;
  if (stripElectronics) v = v.replace(/Electronics$/, '');
  return cap(v);
}

export function parseFit(bytes: ArrayBuffer, fileName: string): ParsedFile {
  let messages: any;
  let errors: unknown[] = [];
  try {
    const decoder = new Decoder(Stream.fromArrayBuffer(bytes));
    if (!decoder.isFIT()) throw new FitError(NOT_FIT);
    ({ messages, errors } = decoder.read());
  } catch (e) {
    if (e instanceof FitError) throw e;
    throw new FitError(NOT_FIT);
  }

  const raw: any[] = messages?.recordMesgs ?? [];
  const records: FitRecord[] = [];
  for (const r of raw) {
    if (!(r.timestamp instanceof Date)) continue;
    records.push({
      t: Math.round(r.timestamp.getTime() / 1000),
      power: r.power ?? null,
      cadence: r.cadence ?? null,
    });
  }
  if (records.length === 0 && errors.length > 0) throw new FitError(NOT_FIT);

  const powers = records.filter((r) => r.power !== null).map((r) => r.power as number);
  if (powers.length === 0) throw new FitError(NO_POWER);

  const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
  const first = records[0].t;
  const last = records[records.length - 1].t;

  const fileId = messages.fileIdMesgs?.[0];
  let device = 'Unknown';
  if (fileId) {
    if (fileId.garminProduct != null) device = prettyProduct(String(fileId.garminProduct));
    else if (fileId.manufacturer != null) device = prettyMaker(String(fileId.manufacturer));
  }
  const meterInfo = (messages.deviceInfoMesgs ?? []).find(
    (d: any) => d.antplusDeviceType === 'bikePower' && d.manufacturer != null,
  );
  if (meterInfo) {
    const main = fileId?.manufacturer != null ? String(fileId.manufacturer) : '';
    const m = String(meterInfo.manufacturer);
    if (m !== main) device += ' · ' + prettyMaker(m, true);
  }

  return {
    meta: { fileName, device, start: new Date(first * 1000), durationSec: last - first, avgPower },
    records,
  };
}
