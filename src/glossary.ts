// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Glossary — click-to-define tooltips for the technical terms in the UI.
 *
 * Any element with `data-term="key"` becomes a dotted-underline trigger. Clicking
 * shows a fixed-position tooltip; Escape or an outside click dismisses it.
 */

export const GLOSSARY: Record<string, string> = {
  'aes-gcm':
    'AES-GCM is an authenticated encryption cipher. It both scrambles your data and attaches a tamper-proof seal (the "auth tag"), so any change to the encrypted file is detected on unlock.',
  pbkdf2:
    'PBKDF2 turns your password into an encryption key by hashing it hundreds of thousands of times. The slowness is deliberate — it makes brute-force guessing of weak passwords far more expensive.',
  salt:
    'A salt is random data mixed into your password before key derivation. It means the same password produces a different key every time, defeating precomputed "rainbow table" attacks. Sealbox stores a fresh salt in each file.',
  nonce:
    'A nonce (or IV) is a number used once per encryption. Sealbox derives a unique nonce for every chunk so identical data never produces identical ciphertext.',
  'auth-tag':
    'The authentication tag is a 16-byte seal AES-GCM appends to each chunk. If anyone alters the file — or you type the wrong password — the tag check fails and Sealbox refuses to produce a result.',
  entropy:
    'Entropy measures how unpredictable a password is, in bits. More bits means exponentially more guesses to crack it. A random five-word passphrase has far more entropy than "Summer2025!".',
};

let tooltipEl: HTMLDivElement | null = null;

export function initGlossary(root: HTMLElement = document.body): void {
  const tip = document.createElement('div');
  tip.className = 'glossary-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  tooltipEl = tip;

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('[data-term]') as HTMLElement | null;
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      showTooltip(target);
    } else if (!tip.contains(e.target as Node)) {
      hideTooltip();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTooltip();
  });
  window.addEventListener('scroll', hideTooltip, true);
}

function showTooltip(trigger: HTMLElement): void {
  if (!tooltipEl) return;
  const term = trigger.dataset.term ?? '';
  const def = GLOSSARY[term];
  if (!def) return;
  tooltipEl.textContent = def;
  tooltipEl.hidden = false;
  const rect = trigger.getBoundingClientRect();
  const tipRect = tooltipEl.getBoundingClientRect();
  let left = rect.left;
  if (left + tipRect.width > window.innerWidth - 12) {
    left = window.innerWidth - tipRect.width - 12;
  }
  tooltipEl.style.left = `${Math.max(12, left)}px`;
  tooltipEl.style.top = `${rect.bottom + 8}px`;
}

function hideTooltip(): void {
  if (tooltipEl) tooltipEl.hidden = true;
}

/** Wrap a term in a glossary trigger span (for building UI strings). */
export function term(key: string, label: string): string {
  return `<span class="glossary-link" data-term="${key}">${label}</span>`;
}
