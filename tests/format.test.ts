import { describe, expect, it } from 'vitest';
import { eta, humanSize, pct, throughput } from '../src/format';

describe('humanSize', () => {
  it('formats bytes', () => {
    expect(humanSize(0)).toBe('0 B');
    expect(humanSize(512)).toBe('512 B');
  });
  it('formats KB/MB/GB', () => {
    expect(humanSize(1536)).toBe('1.5 KB');
    expect(humanSize(1024 * 1024)).toBe('1.0 MB');
    expect(humanSize(5 * 1024 * 1024 * 1024)).toBe('5.0 GB');
  });
  it('handles invalid input', () => {
    expect(humanSize(-1)).toBe('—');
    expect(humanSize(NaN)).toBe('—');
  });
});

describe('throughput', () => {
  it('computes a rate', () => {
    expect(throughput(1024 * 1024, 1000)).toBe('1.0 MB/s');
  });
  it('guards against zero elapsed', () => {
    expect(throughput(100, 0)).toBe('—');
    expect(throughput(0, 100)).toBe('—');
  });
});

describe('eta', () => {
  it('estimates seconds remaining', () => {
    // 50% done in 1000ms → ~1s remaining
    expect(eta(50, 100, 1000)).toBe('1s');
  });
  it('formats minutes', () => {
    // 10% done in 60s → 540s remaining = 9m 00s
    expect(eta(10, 100, 60000)).toBe('9m 00s');
  });
  it('returns dash when complete or unknown', () => {
    expect(eta(100, 100, 1000)).toBe('—');
    expect(eta(0, 100, 1000)).toBe('—');
  });
});

describe('pct', () => {
  it('computes and clamps percentages', () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(0, 0)).toBe(0);
    expect(pct(200, 100)).toBe(100);
    expect(pct(-5, 100)).toBe(0);
  });
});
