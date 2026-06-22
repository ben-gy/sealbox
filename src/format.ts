/** Small presentation helpers — pure functions, unit-tested. */

/** Human-readable byte size, e.g. 1536 → "1.5 KB". */
export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Throughput from bytes done over elapsed milliseconds, e.g. "12.4 MB/s". */
export function throughput(bytesDone: number, elapsedMs: number): string {
  if (elapsedMs <= 0 || bytesDone <= 0) return '—';
  return `${humanSize((bytesDone / elapsedMs) * 1000)}/s`;
}

/** Rough ETA string from progress + elapsed time. */
export function eta(done: number, total: number, elapsedMs: number): string {
  if (done <= 0 || total <= 0 || done >= total || elapsedMs <= 0) return '—';
  const rate = done / elapsedMs; // bytes per ms
  const remainingMs = (total - done) / rate;
  const secs = Math.ceil(remainingMs / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Clamp a percentage to [0, 100] and round. */
export function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}
