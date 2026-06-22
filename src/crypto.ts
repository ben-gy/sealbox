/**
 * Sealbox crypto core — client-side, password-based, authenticated file encryption.
 *
 * Uses the Web Crypto API only:
 *   - PBKDF2-SHA-256 to stretch the password into a 256-bit key (per-file random salt).
 *   - AES-GCM-256 to encrypt each frame with a per-frame nonce + the frame index as
 *     additional authenticated data (AAD), so frames can't be reordered or dropped
 *     without the auth tag failing.
 *
 * ── Wire format of a `.sealbox` container ──────────────────────────────────────
 *
 *   HEADER (41 bytes, plaintext — lets the tool recognise its own files):
 *     "SEALBOX"            7 bytes   magic
 *     version             1 byte    = 1
 *     flags               1 byte    bit0 = data frames are gzip-compressed
 *     iterations          4 bytes   PBKDF2 iteration count (uint32 BE)
 *     salt                16 bytes  PBKDF2 salt
 *     baseIv              8 bytes   random base nonce (per file)
 *     chunkSize           4 bytes   plaintext chunk size used (uint32 BE)
 *
 *   FRAMES (repeated until EOF):
 *     cipherLen           4 bytes   length of this frame's ciphertext (uint32 BE)
 *     ciphertext          N bytes   AES-GCM output incl. 16-byte auth tag
 *
 *   Frame 0  = encrypted JSON metadata ({ name, type, size, compressed, chunks }).
 *   Frame i  = encrypted data chunk i (1-indexed).
 *
 *   The per-frame nonce is  baseIv (8 bytes) || frameIndex (uint32 BE) = 12 bytes.
 *   The AAD for frame i is   frameIndex (uint32 BE).
 */

import type { FileMeta, SealboxHeader } from './types';

export const MAGIC = new Uint8Array([0x53, 0x45, 0x41, 0x4c, 0x42, 0x4f, 0x58]); // "SEALBOX"
export const VERSION = 1;
export const HEADER_BYTES = 41;
export const SALT_BYTES = 16;
export const BASE_IV_BYTES = 8;
export const TAG_BYTES = 16;
export const DEFAULT_CHUNK_SIZE = 1024 * 1024; // 1 MiB plaintext per data frame
export const DEFAULT_ITERATIONS = 310_000; // OWASP 2023 guidance for PBKDF2-SHA256
export const FLAG_COMPRESSED = 0x01;

const ALGO = 'AES-GCM';

/** Derive an AES-GCM-256 key from a password using PBKDF2-SHA-256. */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  if (password.length === 0) throw new Error('Password must not be empty');
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    baseKey,
    { name: ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Build the 12-byte nonce for a given frame: baseIv (8) || index (uint32 BE). */
export function frameNonce(baseIv: Uint8Array, index: number): Uint8Array {
  const nonce = new Uint8Array(12);
  nonce.set(baseIv.subarray(0, BASE_IV_BYTES), 0);
  new DataView(nonce.buffer).setUint32(BASE_IV_BYTES, index >>> 0, false);
  return nonce;
}

/** The AAD bytes for a frame — the 4-byte big-endian frame index. */
export function frameAad(index: number): Uint8Array {
  const aad = new Uint8Array(4);
  new DataView(aad.buffer).setUint32(0, index >>> 0, false);
  return aad;
}

/** Encrypt one frame. Returns ciphertext including the 16-byte GCM tag. */
export async function encryptFrame(
  key: CryptoKey,
  baseIv: Uint8Array,
  index: number,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const buf = await crypto.subtle.encrypt(
    {
      name: ALGO,
      iv: frameNonce(baseIv, index) as BufferSource,
      additionalData: frameAad(index) as BufferSource,
    },
    key,
    plaintext as BufferSource,
  );
  return new Uint8Array(buf);
}

/** Decrypt one frame. Throws on a bad password, tampering, or reordering. */
export async function decryptFrame(
  key: CryptoKey,
  baseIv: Uint8Array,
  index: number,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const buf = await crypto.subtle.decrypt(
    {
      name: ALGO,
      iv: frameNonce(baseIv, index) as BufferSource,
      additionalData: frameAad(index) as BufferSource,
    },
    key,
    ciphertext as BufferSource,
  );
  return new Uint8Array(buf);
}

export interface HeaderOpts {
  flags: number;
  iterations: number;
  salt: Uint8Array;
  baseIv: Uint8Array;
  chunkSize: number;
}

/** Serialise the 41-byte container header. */
export function buildHeader(opts: HeaderOpts): Uint8Array {
  if (opts.salt.length !== SALT_BYTES) throw new Error('Bad salt length');
  if (opts.baseIv.length !== BASE_IV_BYTES) throw new Error('Bad baseIv length');
  const out = new Uint8Array(HEADER_BYTES);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[7] = VERSION;
  out[8] = opts.flags & 0xff;
  dv.setUint32(9, opts.iterations >>> 0, false);
  out.set(opts.salt, 13);
  out.set(opts.baseIv, 29);
  dv.setUint32(37, opts.chunkSize >>> 0, false);
  return out;
}

/** Parse and validate a container header from the start of `bytes`. */
export function parseHeader(bytes: Uint8Array): SealboxHeader {
  if (bytes.length < HEADER_BYTES) throw new Error('Not a Sealbox file (too short)');
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Not a Sealbox file (bad magic bytes)');
  }
  const version = bytes[7];
  if (version !== VERSION) throw new Error(`Unsupported Sealbox version: ${version}`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[8];
  const iterations = dv.getUint32(9, false);
  const salt = bytes.slice(13, 29);
  const baseIv = bytes.slice(29, 37);
  const chunkSize = dv.getUint32(37, false);
  if (iterations < 1 || iterations > 10_000_000) throw new Error('Corrupt header (iterations)');
  if (chunkSize < 1 || chunkSize > 64 * 1024 * 1024) throw new Error('Corrupt header (chunk size)');
  return { version, flags, iterations, salt, baseIv, chunkSize, bodyOffset: HEADER_BYTES };
}

/** True if `bytes` begins with the Sealbox magic — used to auto-detect mode. */
export function looksLikeSealbox(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length + 1) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return bytes[7] === VERSION;
}

// ── gzip via Compression Streams ───────────────────────────────────────────────

/** Is the Compression Streams API available in this environment? */
export function compressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

async function pipeThroughStream(data: Uint8Array, ts: GenericTransformStream): Promise<Uint8Array> {
  const writer = ts.writable.getWriter();
  void writer.write(data as BufferSource);
  void writer.close();

  const reader = ts.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value as Uint8Array);
  }
  return concatBytes(chunks);
}

export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  return pipeThroughStream(data, new CompressionStream('gzip'));
}

export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  return pipeThroughStream(data, new DecompressionStream('gzip'));
}

// ── in-memory convenience (used by tests; the worker streams instead) ───────────

export interface LockOptions {
  compress?: boolean;
  iterations?: number;
  chunkSize?: number;
}

/**
 * Encrypt a whole buffer in memory and return a complete `.sealbox` container.
 * The worker uses the frame primitives directly for streaming; this is the
 * straightforward path used by unit tests and small inputs.
 */
export async function encryptBytes(
  data: Uint8Array,
  meta: Pick<FileMeta, 'name' | 'type'>,
  password: string,
  opts: LockOptions = {},
): Promise<Uint8Array> {
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const wantCompress = (opts.compress ?? false) && compressionSupported();

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const baseIv = crypto.getRandomValues(new Uint8Array(BASE_IV_BYTES));
  const key = await deriveKey(password, salt, iterations);

  const payload = wantCompress ? await gzip(data) : data;
  const chunkCount = Math.max(1, Math.ceil(payload.length / chunkSize));

  const fileMeta: FileMeta = {
    name: meta.name,
    type: meta.type,
    size: data.length,
    compressed: wantCompress,
    chunks: chunkCount,
  };

  const flags = wantCompress ? FLAG_COMPRESSED : 0;
  const parts: Uint8Array[] = [buildHeader({ flags, iterations, salt, baseIv, chunkSize })];

  // Frame 0: metadata.
  const metaBytes = new TextEncoder().encode(JSON.stringify(fileMeta));
  parts.push(lengthPrefixed(await encryptFrame(key, baseIv, 0, metaBytes)));

  // Frames 1..n: data.
  for (let i = 0; i < chunkCount; i++) {
    const slice = payload.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, payload.length));
    parts.push(lengthPrefixed(await encryptFrame(key, baseIv, i + 1, slice)));
  }

  return concatBytes(parts);
}

export interface DecryptedResult {
  meta: FileMeta;
  data: Uint8Array;
}

/** Decrypt a complete `.sealbox` container in memory. Throws on any failure. */
export async function decryptBytes(container: Uint8Array, password: string): Promise<DecryptedResult> {
  const header = parseHeader(container);
  const key = await deriveKey(password, header.salt, header.iterations);

  const reader = new FrameReader(container, header.bodyOffset);

  let metaBytes: Uint8Array;
  try {
    metaBytes = await decryptFrame(key, header.baseIv, 0, reader.next());
  } catch {
    throw new Error('Wrong password or corrupted file');
  }
  const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as FileMeta;

  const chunks: Uint8Array[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    if (!reader.hasNext()) throw new Error('File is truncated — missing data frames');
    chunks.push(await decryptFrame(key, header.baseIv, i + 1, reader.next()));
  }

  let data: Uint8Array = concatBytes(chunks);
  if (meta.compressed) {
    if (!compressionSupported()) throw new Error('This file is compressed but your browser lacks gzip support');
    data = await gunzip(data);
  }
  return { meta, data };
}

// ── frame framing helpers ───────────────────────────────────────────────────────

/** Prefix a frame's ciphertext with its 4-byte big-endian length. */
export function lengthPrefixed(cipher: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + cipher.length);
  new DataView(out.buffer).setUint32(0, cipher.length, false);
  out.set(cipher, 4);
  return out;
}

/** Reads length-prefixed frames out of a container body. */
export class FrameReader {
  private offset: number;
  constructor(private readonly bytes: Uint8Array, start: number) {
    this.offset = start;
  }
  hasNext(): boolean {
    return this.offset + 4 <= this.bytes.length;
  }
  next(): Uint8Array {
    if (this.offset + 4 > this.bytes.length) throw new Error('Truncated frame length');
    const len = new DataView(
      this.bytes.buffer,
      this.bytes.byteOffset + this.offset,
      4,
    ).getUint32(0, false);
    this.offset += 4;
    if (this.offset + len > this.bytes.length) throw new Error('Truncated frame body');
    const frame = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    return frame;
  }
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Append `.sealbox` to a name (or strip it on unlock). */
export function lockedName(name: string): string {
  return `${name}.sealbox`;
}

export function unlockedName(metaName: string, containerName: string): string {
  if (metaName && metaName.trim()) return metaName;
  // Fallback: strip a trailing .sealbox from the container's own name.
  return containerName.replace(/\.sealbox$/i, '') || 'sealbox-output';
}
