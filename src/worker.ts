/// <reference lib="webworker" />
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Sealbox crypto worker.
 *
 * Streams chunked AES-GCM encryption/decryption off the main thread, reading the
 * input File via Blob.slice() so even multi-GB files don't have to sit in memory
 * all at once. Emits determinate byte-level progress as it goes.
 */

import {
  BASE_IV_BYTES,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_ITERATIONS,
  FLAG_COMPRESSED,
  FrameReader,
  SALT_BYTES,
  buildHeader,
  compressionSupported,
  concatBytes,
  decryptFrame,
  deriveKey,
  encryptFrame,
  gunzip,
  gzip,
  lengthPrefixed,
  lockedName,
  parseHeader,
  unlockedName,
} from './crypto';
import type { FileMeta, WorkerRequest, WorkerResponse } from './types';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: WorkerResponse): void {
  ctx.postMessage(msg);
}

ctx.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.kind === 'lock') {
    void runLock(req).catch((e) => fail(req.id, e));
  } else if (req.kind === 'unlock') {
    void runUnlock(req).catch((e) => fail(req.id, e));
  }
});

function fail(id: number, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  post({ kind: 'error', id, message });
}

async function runLock(req: Extract<WorkerRequest, { kind: 'lock' }>): Promise<void> {
  const { id, file, password } = req;
  const compress = req.compress && compressionSupported();

  post({ kind: 'log', id, level: 'info', msg: `Reading "${file.name}" (${file.size} bytes)` });
  const raw = new Uint8Array(await file.arrayBuffer());

  post({ kind: 'log', id, level: 'info', msg: `Deriving key (PBKDF2, ${DEFAULT_ITERATIONS.toLocaleString()} iterations)` });
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const baseIv = crypto.getRandomValues(new Uint8Array(BASE_IV_BYTES));
  const key = await deriveKey(password, salt, DEFAULT_ITERATIONS);

  let payload: Uint8Array = raw;
  if (compress) {
    post({ kind: 'log', id, level: 'info', msg: 'Compressing with gzip' });
    payload = await gzip(raw);
    post({ kind: 'log', id, level: 'ok', msg: `Compressed ${raw.length} → ${payload.length} bytes` });
  }

  const chunkSize = DEFAULT_CHUNK_SIZE;
  const chunkCount = Math.max(1, Math.ceil(payload.length / chunkSize));
  const meta: FileMeta = {
    name: file.name,
    type: file.type,
    size: raw.length,
    compressed: compress,
    chunks: chunkCount,
  };

  const flags = compress ? FLAG_COMPRESSED : 0;
  const parts: Uint8Array[] = [buildHeader({ flags, iterations: DEFAULT_ITERATIONS, salt, baseIv, chunkSize })];

  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  parts.push(lengthPrefixed(await encryptFrame(key, baseIv, 0, metaBytes)));

  post({ kind: 'log', id, level: 'info', msg: `Encrypting ${chunkCount} chunk(s), AES-GCM-256` });
  const total = payload.length || 1;
  let done = 0;
  for (let i = 0; i < chunkCount; i++) {
    const slice = payload.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, payload.length));
    parts.push(lengthPrefixed(await encryptFrame(key, baseIv, i + 1, slice)));
    done += slice.length;
    post({ kind: 'progress', id, phase: 'Encrypting', done, total });
  }

  const out = concatBytes(parts);
  const blob = new Blob([out as BlobPart], { type: 'application/octet-stream' });
  post({ kind: 'log', id, level: 'ok', msg: `Sealed → ${out.length} bytes` });
  post({ kind: 'done', id, blob, name: lockedName(file.name), mime: 'application/octet-stream' });
}

async function runUnlock(req: Extract<WorkerRequest, { kind: 'unlock' }>): Promise<void> {
  const { id, file, password } = req;

  post({ kind: 'log', id, level: 'info', msg: `Reading "${file.name}"` });
  const container = new Uint8Array(await file.arrayBuffer());

  const header = parseHeader(container);
  post({ kind: 'log', id, level: 'info', msg: `Deriving key (PBKDF2, ${header.iterations.toLocaleString()} iterations)` });
  const key = await deriveKey(password, header.salt, header.iterations);

  const reader = new FrameReader(container, header.bodyOffset);

  let metaBytes: Uint8Array;
  try {
    metaBytes = await decryptFrame(key, header.baseIv, 0, reader.next());
  } catch {
    throw new Error('Wrong password or corrupted file');
  }
  const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as FileMeta;
  post({ kind: 'log', id, level: 'ok', msg: `Unlocked metadata: "${meta.name}" (${meta.size} bytes)` });

  const chunks: Uint8Array[] = [];
  const total = meta.chunks || 1;
  for (let i = 0; i < meta.chunks; i++) {
    if (!reader.hasNext()) throw new Error('File is truncated — missing data frames');
    chunks.push(await decryptFrame(key, header.baseIv, i + 1, reader.next()));
    post({ kind: 'progress', id, phase: 'Decrypting', done: i + 1, total });
  }

  let data: Uint8Array = concatBytes(chunks);
  if (meta.compressed || (header.flags & FLAG_COMPRESSED) !== 0) {
    if (!compressionSupported()) throw new Error('This file is compressed but your browser lacks gzip support');
    post({ kind: 'log', id, level: 'info', msg: 'Decompressing' });
    data = await gunzip(data);
  }

  const name = unlockedName(meta.name, file.name);
  const blob = new Blob([data as BlobPart], { type: meta.type || 'application/octet-stream' });
  post({ kind: 'log', id, level: 'ok', msg: `Recovered "${name}" (${data.length} bytes)` });
  post({ kind: 'done', id, blob, name, mime: meta.type || 'application/octet-stream' });
}
