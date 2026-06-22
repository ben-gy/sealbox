/** Shared types for the Sealbox crypto pipeline and worker RPC. */

/** Metadata about the original file, stored encrypted inside frame 0. */
export interface FileMeta {
  /** Original filename, e.g. "tax-return-2025.pdf". */
  name: string;
  /** Original MIME type, e.g. "application/pdf" (may be ""). */
  type: string;
  /** Original plaintext byte length. */
  size: number;
  /** Whether data frames are gzip-compressed before encryption. */
  compressed: boolean;
  /** Total number of data frames (excludes the metadata frame). */
  chunks: number;
}

/** Parsed, validated header of a .sealbox container. */
export interface SealboxHeader {
  version: number;
  flags: number;
  iterations: number;
  salt: Uint8Array;
  baseIv: Uint8Array;
  chunkSize: number;
  /** Byte offset where frame data begins (immediately after the header). */
  bodyOffset: number;
}

/** Messages sent from the main thread into the worker. */
export type WorkerRequest =
  | {
      kind: 'lock';
      id: number;
      file: File;
      password: string;
      compress: boolean;
    }
  | {
      kind: 'unlock';
      id: number;
      file: File;
      password: string;
    };

/** Messages streamed back from the worker. */
export type WorkerResponse =
  | { kind: 'progress'; id: number; phase: string; done: number; total: number }
  | { kind: 'log'; id: number; level: 'info' | 'ok' | 'warn' | 'err'; msg: string }
  | { kind: 'done'; id: number; blob: Blob; name: string; mime: string }
  | { kind: 'error'; id: number; message: string };
