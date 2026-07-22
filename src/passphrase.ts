// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Passphrase generation + strength estimation.
 *
 * Generation uses a small embedded word list and `crypto.getRandomValues` for
 * unbiased selection (rejection sampling). Strength is a coarse entropy estimate
 * — enough to steer a non-technical user away from "password123", not a substitute
 * for a real password manager.
 */

import { WORD_LIST } from './data/wordlist';

/**
 * Pick `count` words uniformly at random and join with `separator`.
 *
 * The default of 6 words keeps the generated passphrase comfortably above the
 * "strong" threshold of the strength meter for every word-length combination in
 * the list — a 5-word phrase of short words can dip to "fair".
 */
export function generatePassphrase(count = 6, separator = '-'): string {
  if (count < 1) throw new Error('Word count must be at least 1');
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    words.push(WORD_LIST[randomIndex(WORD_LIST.length)]);
  }
  return words.join(separator);
}

/** Bits of entropy for a diceware-style passphrase of `count` words. */
export function passphraseEntropyBits(count: number): number {
  return count * Math.log2(WORD_LIST.length);
}

/** Unbiased random integer in [0, max) using rejection sampling. */
function randomIndex(max: number): number {
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export type StrengthLabel = 'very weak' | 'weak' | 'fair' | 'strong' | 'very strong';

export interface Strength {
  /** Estimated bits of entropy. */
  bits: number;
  /** 0–4 bucket for the meter. */
  score: 0 | 1 | 2 | 3 | 4;
  label: StrengthLabel;
}

/**
 * Coarse entropy estimate for an arbitrary password.
 *
 * Counts the character classes present to estimate an alphabet size, multiplies
 * by length, then applies a penalty for very short or single-class inputs. This
 * is deliberately conservative.
 */
export function estimateStrength(password: string): Strength {
  if (password.length === 0) return { bits: 0, score: 0, label: 'very weak' };

  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;

  // Unique-character ratio damps "aaaaaaaa"-style repetition.
  const uniqueRatio = new Set(password).size / password.length;
  const effectiveLen = password.length * Math.max(0.5, uniqueRatio);
  const bits = Math.round(effectiveLen * Math.log2(Math.max(2, pool)));

  let score: Strength['score'];
  let label: StrengthLabel;
  if (bits < 40) {
    score = 0;
    label = 'very weak';
  } else if (bits < 60) {
    score = 1;
    label = 'weak';
  } else if (bits < 80) {
    score = 2;
    label = 'fair';
  } else if (bits < 110) {
    score = 3;
    label = 'strong';
  } else {
    score = 4;
    label = 'very strong';
  }
  return { bits, score, label };
}
