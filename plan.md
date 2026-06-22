# Tool Plan: Sealbox

## Overview
- **Name:** Sealbox
- **Repo name:** sealbox
- **Tagline:** Lock any file with a password, right in your browser — nothing ever uploaded.

## Problem It Solves
You need to send a sensitive file — a passport scan, a tax return, a contract, a
spreadsheet of salaries — to someone over email, Slack, or a USB stick. Email
"encryption" is a lie, the recipient can't be trusted to handle a plaintext copy,
and every "encrypt PDF online" site wants you to *upload the file to their server
first*. That's exactly the thing you were trying to avoid. You want to type a
password, get back an encrypted blob, send that, and tell the recipient the
password over a separate channel (a phone call, Signal). Sealbox is the tool that
does the locking and unlocking entirely on your own machine.

## Why This Must Be Client-Side
- **Privacy / sensitive-data handling:** the whole point is that the plaintext
  never leaves the device. Uploading it to "encrypt" it defeats the purpose.
- **No-account friction:** no signup, no email, no "free tier". Open the page,
  drag, type, done — even offline.
- **Large-file handling:** chunked streaming encryption means multi-GB files
  work without uploading them or blowing up browser memory.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| Web Crypto (AES-GCM-256) | Authenticated per-chunk encryption | N/A — hard requirement |
| Web Crypto (PBKDF2-SHA-256) | Derive a key from the password (310k iterations) | N/A — hard requirement |
| Compression Streams (gzip) | Optional pre-encryption compression | Skip compression, store raw |
| Web Workers | Run crypto off the main thread, stream progress | N/A — required |
| File API / Blob | Read input, assemble output | N/A |
| Web Share API | Share the encrypted file on mobile | Hide the button |
| Clipboard API | Copy the generated passphrase | Hide the button |
| Service Worker (PWA) | Works fully offline after first load | Online-only |

## Workflow (input → process → output)
1. User drags a file in (or taps to pick), and chooses **Lock** or **Unlock**
   (auto-detected from the `.sealbox` magic bytes).
2. User types a password (Lock mode offers a "generate strong passphrase" button
   with a diceware-style word list, plus a live strength meter).
3. A Web Worker derives the key (PBKDF2) and encrypts/decrypts the file in 1 MiB
   chunks, emitting determinate byte-level progress + throughput.
4. User downloads the `name.sealbox` (or recovered original), copies the
   passphrase, or shares via the native share sheet.

## Non-Goals
- No cloud sync, ever.
- No public-key / recipient-keypair mode in v1 (password only).
- No multi-file batching in v1 (one file at a time; folders out of scope).
- No password "recovery" — forget it and the file is gone (that's the point).

## Target Audience
A non-technical professional handling a confidential document at their desk —
an accountant emailing a client's return, an HR manager sending an offer letter,
a journalist sending notes to a source. Stressed, on a laptop, scared of leaks,
not a developer. Wants reassurance and a button that obviously works.

## Style Direction
**Tone:** trustworthy, calm, reassuring (consumer / small-business, not hacker).
**Colour palette:** warm light theme — near-white surfaces, deep slate text, a
single confident teal-green "secure" accent. Green-locked semantics. Why: the
audience needs to *feel safe*, not impressed; a dark terminal look would read as
"sketchy crypto site" to them.
**UI density:** spacious.
**Dark/light theme:** light (system-default respected via `prefers-color-scheme`,
but designed light-first).
**Reference tools for feel:** the calm of 1Password's welcome screens; the
single-job clarity of Squoosh.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React — it's a single input→process→output
  flow with no complex pane state.
- **Key libraries:** none at runtime beyond the browser. (Word list for passphrase
  generation is embedded as TS data.)
- **Worker strategy:** single dedicated Web Worker that streams chunked AES-GCM and
  posts progress messages. Main thread stays responsive.
- **Storage:** none for user data. `localStorage` only for the compression toggle
  and theme preference.

## Privacy & Trust Model
**Protected**
- File contents — AES-GCM-256 authenticated encryption, per-chunk.
- Original filename + MIME type — stored inside an encrypted metadata frame.
- The password — never stored, never transmitted; only held in tab memory during
  the operation and zeroed after.

**Not protected**
- The *size* of the file (the ciphertext length ≈ plaintext length is visible to
  anyone who sees the `.sealbox`).
- The fact that you encrypted *something* (the `SEALBOX1` magic header is plaintext
  so the tool can recognise its own files).
- Password strength — a weak password means a weak file. The strength meter warns,
  but can't stop you.

**Trust surface**
- The static site bundle served by GitHub Pages (hash-pinned at deploy).
- The TLS chain between the user and GitHub Pages for the *initial page load only*.
- After load, the tool runs offline (Service Worker) — no network calls at all
  during encryption/decryption. Verify in DevTools → Network: zero requests.

## UX Required Surfaces
- Drop zone (drag-drop + tap-to-pick + paste), accepted-formats caption ("any file").
- Determinate progress bar with MB/s throughput + ETA.
- Event log drawer (Dropwell pattern) streaming each phase: derive key, encrypt
  chunk N, write frame, done.
- How-It-Works modal (5 steps).
- Threat Model modal (Protected / Not protected / Trust surface).
- About modal with benrichardson.dev attribution + source link.
- Output delivery: download + copy-passphrase + Web Share.
- Keyboard shortcuts: Escape (close modals), Enter (run primary action).
- Sticky footer "Built by benrichardson.dev".
- Glossary tooltips for AES-GCM, PBKDF2, salt, IV/nonce, auth tag.
