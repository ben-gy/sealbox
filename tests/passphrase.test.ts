import { describe, expect, it } from 'vitest';
import { estimateStrength, generatePassphrase, passphraseEntropyBits } from '../src/passphrase';
import { WORD_LIST } from '../src/data/wordlist';

describe('wordlist', () => {
  it('has no duplicates', () => {
    expect(new Set(WORD_LIST).size).toBe(WORD_LIST.length);
  });
  it('is all lowercase, non-empty words', () => {
    for (const w of WORD_LIST) {
      expect(w).toMatch(/^[a-z]+$/);
    }
  });
  it('is large enough for reasonable entropy', () => {
    expect(WORD_LIST.length).toBeGreaterThanOrEqual(256);
  });
});

describe('generatePassphrase', () => {
  it('produces the requested number of words', () => {
    const p = generatePassphrase(5);
    expect(p.split('-')).toHaveLength(5);
  });
  it('respects a custom separator', () => {
    const p = generatePassphrase(3, ' ');
    expect(p.split(' ')).toHaveLength(3);
  });
  it('only emits words from the list', () => {
    const words = generatePassphrase(8).split('-');
    for (const w of words) expect(WORD_LIST).toContain(w);
  });
  it('rejects a word count below 1', () => {
    expect(() => generatePassphrase(0)).toThrow();
  });
  it('is not trivially constant across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) seen.add(generatePassphrase(5));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('passphraseEntropyBits', () => {
  it('scales with word count', () => {
    expect(passphraseEntropyBits(5)).toBeCloseTo(5 * Math.log2(WORD_LIST.length), 5);
    expect(passphraseEntropyBits(10)).toBeGreaterThan(passphraseEntropyBits(5));
  });
});

describe('estimateStrength', () => {
  it('rates an empty password very weak', () => {
    const s = estimateStrength('');
    expect(s.score).toBe(0);
    expect(s.bits).toBe(0);
  });
  it('rates a short numeric password weak', () => {
    expect(estimateStrength('1234').score).toBeLessThanOrEqual(1);
  });
  it('rates a generated passphrase strongly', () => {
    const s = estimateStrength(generatePassphrase());
    expect(s.score).toBeGreaterThanOrEqual(3);
  });
  it('penalises repeated characters', () => {
    const repeated = estimateStrength('aaaaaaaaaaaaaaaa');
    const varied = estimateStrength('a8Kd!2pQ9zRw#4mL');
    expect(repeated.bits).toBeLessThan(varied.bits);
  });
  it('returns one of the known labels', () => {
    const labels = ['very weak', 'weak', 'fair', 'strong', 'very strong'];
    expect(labels).toContain(estimateStrength('hunter2').label);
  });
});
