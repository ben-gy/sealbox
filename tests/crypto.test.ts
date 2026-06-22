import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHUNK_SIZE,
  FrameReader,
  HEADER_BYTES,
  buildHeader,
  compressionSupported,
  concatBytes,
  decryptBytes,
  encryptBytes,
  gunzip,
  gzip,
  lengthPrefixed,
  lockedName,
  looksLikeSealbox,
  parseHeader,
  unlockedName,
} from '../src/crypto';

const PW = 'correct-horse-battery-staple';

function randBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (i * 31 + 7) & 0xff;
  return out;
}

describe('header round-trip', () => {
  it('builds and parses a header symmetrically', () => {
    const salt = new Uint8Array(16).fill(9);
    const baseIv = new Uint8Array(8).fill(3);
    const bytes = buildHeader({ flags: 1, iterations: 310000, salt, baseIv, chunkSize: 1024 });
    expect(bytes.length).toBe(HEADER_BYTES);
    const h = parseHeader(bytes);
    expect(h.version).toBe(1);
    expect(h.flags).toBe(1);
    expect(h.iterations).toBe(310000);
    expect(h.chunkSize).toBe(1024);
    expect([...h.salt]).toEqual([...salt]);
    expect([...h.baseIv]).toEqual([...baseIv]);
  });

  it('rejects non-sealbox bytes', () => {
    expect(() => parseHeader(new Uint8Array(HEADER_BYTES))).toThrow(/magic/i);
  });

  it('rejects a too-short buffer', () => {
    expect(() => parseHeader(new Uint8Array(5))).toThrow(/too short/i);
  });

  it('looksLikeSealbox detects its own header but not random data', () => {
    const salt = new Uint8Array(16);
    const baseIv = new Uint8Array(8);
    const h = buildHeader({ flags: 0, iterations: 1000, salt, baseIv, chunkSize: 1024 });
    expect(looksLikeSealbox(h)).toBe(true);
    expect(looksLikeSealbox(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(false);
    expect(looksLikeSealbox(new Uint8Array(2))).toBe(false);
  });
});

describe('frame framing', () => {
  it('length-prefixes and reads frames back', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([9, 8]);
    const body = concatBytes([lengthPrefixed(a), lengthPrefixed(b)]);
    const reader = new FrameReader(body, 0);
    expect([...reader.next()]).toEqual([1, 2, 3]);
    expect(reader.hasNext()).toBe(true);
    expect([...reader.next()]).toEqual([9, 8]);
    expect(reader.hasNext()).toBe(false);
  });

  it('throws on a truncated frame body', () => {
    const a = lengthPrefixed(new Uint8Array([1, 2, 3]));
    const reader = new FrameReader(a.subarray(0, 5), 0); // length says 3 but only 1 byte present
    expect(() => reader.next()).toThrow(/truncated/i);
  });
});

describe('encrypt / decrypt round-trip', () => {
  it('round-trips a small buffer', async () => {
    const data = new TextEncoder().encode('hello sealbox');
    const container = await encryptBytes(data, { name: 'note.txt', type: 'text/plain' }, PW);
    expect(looksLikeSealbox(container)).toBe(true);
    const { meta, data: out } = await decryptBytes(container, PW);
    expect(meta.name).toBe('note.txt');
    expect(meta.type).toBe('text/plain');
    expect(new TextDecoder().decode(out)).toBe('hello sealbox');
  });

  it('handles an empty file', async () => {
    const container = await encryptBytes(new Uint8Array(0), { name: 'empty', type: '' }, PW);
    const { meta, data } = await decryptBytes(container, PW);
    expect(meta.size).toBe(0);
    expect(data.length).toBe(0);
  });

  it('handles a 1-byte file', async () => {
    const container = await encryptBytes(new Uint8Array([42]), { name: 'one', type: '' }, PW);
    const { data } = await decryptBytes(container, PW);
    expect([...data]).toEqual([42]);
  });

  it('round-trips across multiple chunk boundaries', async () => {
    // Force a tiny chunk size so we exercise many frames.
    const data = randBytes(1000);
    const container = await encryptBytes(data, { name: 'blob.bin', type: '' }, PW, { chunkSize: 64 });
    const { meta, data: out } = await decryptBytes(container, PW);
    expect(meta.chunks).toBe(Math.ceil(1000 / 64));
    expect([...out]).toEqual([...data]);
  });

  it('round-trips data exactly on a chunk boundary', async () => {
    const data = randBytes(128);
    const container = await encryptBytes(data, { name: 'aligned', type: '' }, PW, { chunkSize: 64 });
    const { data: out } = await decryptBytes(container, PW);
    expect([...out]).toEqual([...data]);
  });

  it('rejects the wrong password', async () => {
    const container = await encryptBytes(new Uint8Array([1, 2, 3]), { name: 'x', type: '' }, PW);
    await expect(decryptBytes(container, 'wrong-password')).rejects.toThrow(/wrong password|corrupt/i);
  });

  it('rejects a tampered ciphertext', async () => {
    const container = await encryptBytes(randBytes(200), { name: 'x', type: '' }, PW, { chunkSize: 64 });
    container[container.length - 5] ^= 0xff; // flip a byte in the last frame
    await expect(decryptBytes(container, PW)).rejects.toThrow();
  });

  it('rejects a truncated container (missing frames)', async () => {
    const container = await encryptBytes(randBytes(500), { name: 'x', type: '' }, PW, { chunkSize: 64 });
    const cut = container.subarray(0, container.length - 80);
    await expect(decryptBytes(cut, PW)).rejects.toThrow();
  });

  it('refuses an empty password', async () => {
    await expect(encryptBytes(new Uint8Array([1]), { name: 'x', type: '' }, '')).rejects.toThrow(/password/i);
  });
});

describe('compression', () => {
  it('round-trips with gzip when supported', async () => {
    if (!compressionSupported()) return; // environment guard
    const data = new TextEncoder().encode('aaaaaaaaaaaaaaaaaaaaaaaaaaaa'.repeat(50));
    const container = await encryptBytes(data, { name: 'rep.txt', type: 'text/plain' }, PW, { compress: true });
    const { meta, data: out } = await decryptBytes(container, PW);
    expect(meta.compressed).toBe(true);
    expect([...out]).toEqual([...data]);
  });

  it('gzip then gunzip is identity', async () => {
    if (!compressionSupported()) return;
    const data = randBytes(2048);
    const round = await gunzip(await gzip(data));
    expect([...round]).toEqual([...data]);
  });
});

describe('name helpers', () => {
  it('locks and unlocks names', () => {
    expect(lockedName('report.pdf')).toBe('report.pdf.sealbox');
    expect(unlockedName('report.pdf', 'report.pdf.sealbox')).toBe('report.pdf');
    expect(unlockedName('', 'archive.sealbox')).toBe('archive');
    expect(unlockedName('', 'noext')).toBe('noext');
  });
});

describe('default chunk size', () => {
  it('is 1 MiB', () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(1024 * 1024);
  });
});
