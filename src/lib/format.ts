const MINUS = '−';

function signed(v: number, text: string, sign: boolean): string {
  if (v === 0) return sign ? '+' + text.replace(/^-/, '') : text.replace(/^-/, '');
  if (text.startsWith('-')) return MINUS + text.slice(1);
  return sign && v > 0 ? '+' + text : text;
}

export function formatW(w: number, sign = false): string {
  const t = w.toFixed(1);
  return signed(Number(t), t, sign) + ' W';
}

export function formatPct(p: number, sign = false): string {
  const t = p.toFixed(1);
  return signed(Number(t), t, sign) + '%';
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
}

export function formatClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
