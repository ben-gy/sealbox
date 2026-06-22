# sealbox

**Lock any file with a password, right in your browser — nothing ever uploaded.**

Live: https://sealbox.benrichardson.dev

---

## what it is

Sealbox password-protects files using strong, authenticated encryption that runs
entirely on your device. Drop in a file, type a password, and you get back a
`.sealbox` file you can send over email, a USB stick, or any chat app. The
recipient drops that `.sealbox` into Sealbox, types the password you shared with
them separately, and gets the original file back — name and all.

It exists because every "encrypt a file online" service asks you to *upload the
very file you're trying to keep private* before it will encrypt it. Sealbox never
does. There is no server, no account, and no upload — after the page loads it
works completely offline.

It's for anyone handling a confidential document who isn't a cryptographer: an
accountant emailing a client's tax return, an HR manager sending an offer letter,
a journalist protecting notes. The privacy guarantee is simple and verifiable:
open DevTools → Network and watch zero requests fire while you encrypt.

## how it works

```
 plaintext file ──▶ [gzip?] ──▶ split into 1 MiB chunks
                                        │
 password ──▶ PBKDF2-SHA256 (310k) ──▶ AES-256-GCM key
                                        │
                                        ▼
 .sealbox = HEADER ‖ frame0(metadata) ‖ frame1 ‖ frame2 ‖ …
```

The work happens in a dedicated Web Worker so the UI never freezes, and files are
read/processed in chunks so multi-GB inputs don't exhaust browser memory.

### wire format

A `.sealbox` container is a 41-byte plaintext header followed by length-prefixed,
individually-encrypted frames:

```
HEADER (41 bytes, plaintext so the tool recognises its own files)
  "SEALBOX"   7 bytes   magic
  version     1 byte    = 1
  flags       1 byte    bit0 = data frames are gzip-compressed
  iterations  4 bytes   PBKDF2 iteration count (uint32 BE)
  salt        16 bytes  PBKDF2 salt (random per file)
  baseIv      8 bytes   base nonce (random per file)
  chunkSize   4 bytes   plaintext chunk size used (uint32 BE)

FRAMES (repeated until EOF)
  cipherLen   4 bytes   length of this frame's ciphertext (uint32 BE)
  ciphertext  N bytes   AES-GCM output, includes the 16-byte auth tag

  frame 0     encrypted JSON metadata { name, type, size, compressed, chunks }
  frame i     encrypted data chunk i
```

Per-frame nonce = `baseIv (8 bytes) ‖ frameIndex (uint32 BE)`, and the frame index
is also passed as AES-GCM additional authenticated data — so a frame can't be
silently reordered, duplicated, or dropped without the auth-tag check failing. The
metadata frame records the total chunk count, so truncation is detected too.

## browser APIs used

- **Web Crypto — AES-GCM-256** — authenticated encryption of every frame.
- **Web Crypto — PBKDF2-SHA-256** — stretches the password into a key (310,000
  iterations, per-file random salt).
- **Compression Streams (gzip)** — optional pre-encryption compression.
- **Web Workers** — all crypto runs off the main thread, streaming progress.
- **File API / Blob** — chunked reads of the input, assembly of the output.
- **Web Share API** — share the result on mobile (where supported).
- **Clipboard API** — copy the generated passphrase.
- **Service Worker** — full offline support after the first load.

## security / privacy model

**Protected**
- File contents — AES-GCM-256, authenticated, per chunk.
- The original filename and MIME type — stored inside an encrypted frame.
- Your password — never stored, never transmitted; only in tab memory during the
  operation.
- Integrity — any altered byte fails the auth tag, so tampering is always caught.

**Not protected**
- The file's *size* (ciphertext length ≈ plaintext length).
- The fact that it's a Sealbox file (the `SEALBOX` magic header is plaintext).
- A weak password — Sealbox can't make "1234" strong; the strength meter warns you.

**Trust model**
- You trust the static site bundle from GitHub Pages and the TLS chain — for the
  *initial page load only*.
- After loading, encryption makes **zero** network calls. Verify in DevTools.
- No analytics, no cookies, no third-party fonts, no telemetry.
- You and your recipient must exchange the password over a channel you trust.

## stack

- Vite 6 + vanilla TypeScript
- Web Crypto, Compression Streams, Web Workers — no runtime dependencies
- Vitest for unit tests (42 tests across crypto, passphrase, and format modules)
- GitHub Pages for hosting, deployed via GitHub Actions

No runtime dependencies. No analytics, no cookies, no third-party fonts, no
telemetry.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests,
builds, and deploys `dist/` to GitHub Pages. The custom domain is set via
`public/CNAME` — point a `CNAME` DNS record for `sealbox.benrichardson.dev` at
`ben-gy.github.io`.

## license

MIT — see [LICENSE](./LICENSE).
