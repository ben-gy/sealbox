# sealbox — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/sealbox/ *(redirects to the custom domain)*
- **Custom domain:** https://sealbox.benrichardson.dev

## What it is

Lock any file with a password in your browser using AES-256-GCM (PBKDF2 key derivation),
with gzip pre-compression via Compression Streams. Nothing is uploaded; works offline.

## DNS

CNAME `sealbox` → `ben-gy.github.io` (Cloudflare, DNS-only) — already created.
