/**
 * Sealbox — main thread. Owns DOM wiring and the lock/unlock workflow; all heavy
 * crypto runs in worker.ts. No business logic lives here beyond orchestration.
 */

// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles/main.css';
import { looksLikeSealbox, MAGIC, VERSION } from './crypto';
import { emit, mountEventDrawer } from './eventlog';
import { initGlossary } from './glossary';
import { eta, humanSize, pct, throughput } from './format';
import { estimateStrength, generatePassphrase, passphraseEntropyBits } from './passphrase';
import type { WorkerRequest, WorkerResponse } from './types';

type Mode = 'lock' | 'unlock';

interface State {
  file: File | null;
  mode: Mode;
  lastPassword: string;
  busy: boolean;
}

const state: State = { file: null, mode: 'lock', lastPassword: '', busy: false };

// ── element handles ──────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

let worker: Worker | null = null;
let reqId = 0;
let opStart = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (ev: MessageEvent<WorkerResponse>) => handleWorkerMessage(ev.data));
    worker.addEventListener('error', (e) => {
      showError(`Worker crashed: ${e.message}`);
    });
  }
  return worker;
}

// ── bootstrap ──────────────────────────────────────────────────────────────────
function init(): void {
  mountEventDrawer($('event-drawer'));
  initGlossary(document.body);
  wireModals();
  wireDropzone();
  wirePassword();
  wireActions();
  emit('system', 'ok', 'Sealbox ready — everything runs in your browser');
  emit('system', 'info', `format SEALBOX v${VERSION} · magic ${[...MAGIC].map((b) => b.toString(16)).join('')}`);
  setStatus('ready', 'idle');
}

// ── dropzone ────────────────────────────────────────────────────────────────────
function wireDropzone(): void {
  const dz = $('dropzone');
  const input = $<HTMLInputElement>('file-input');

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) void acceptFile(input.files[0]);
  });

  ['dragenter', 'dragover'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('drag-over');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === 'dragleave' && dz.contains((e as DragEvent).relatedTarget as Node)) return;
      dz.classList.remove('drag-over');
    }),
  );
  dz.addEventListener('drop', (e) => {
    const dt = (e as DragEvent).dataTransfer;
    if (dt && dt.files && dt.files[0]) void acceptFile(dt.files[0]);
  });

  $('clear-file').addEventListener('click', resetFile);
}

async function acceptFile(file: File): Promise<void> {
  // Sniff the first bytes to auto-detect lock vs unlock.
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  state.file = file;
  state.mode = looksLikeSealbox(head) ? 'unlock' : 'lock';

  $('file-name').textContent = file.name;
  $('file-size').textContent = humanSize(file.size);
  $('dropzone').hidden = true;
  $('workspace').hidden = false;
  hide('result');
  hide('error');
  hide('progress');

  applyMode();
  emit('file', 'ok', `Loaded "${file.name}" (${humanSize(file.size)}) → ${state.mode} mode`);
  $<HTMLInputElement>('password').focus();
}

function resetFile(): void {
  state.file = null;
  $<HTMLInputElement>('file-input').value = '';
  $<HTMLInputElement>('password').value = '';
  $('dropzone').hidden = false;
  $('workspace').hidden = true;
  setStatus('ready', 'idle');
  updateRunEnabled();
}

function applyMode(): void {
  const badge = $('mode-badge');
  const label = $('password-label');
  const runBtn = $<HTMLButtonElement>('run-btn');
  const lockOpts = $('lock-options');
  const gen = $('generate-pass');

  if (state.mode === 'lock') {
    badge.textContent = '🔒 will lock';
    badge.className = 'mode-badge lock';
    label.textContent = 'Choose a password';
    runBtn.textContent = 'Lock file';
    lockOpts.hidden = false;
    gen.hidden = false;
  } else {
    badge.textContent = '🔓 will unlock';
    badge.className = 'mode-badge unlock';
    label.textContent = 'Enter the password';
    runBtn.textContent = 'Unlock file';
    lockOpts.hidden = true;
    gen.hidden = true;
  }
  updateStrength();
  updateRunEnabled();
}

// ── password ─────────────────────────────────────────────────────────────────
function wirePassword(): void {
  const pw = $<HTMLInputElement>('password');
  pw.addEventListener('input', () => {
    updateStrength();
    updateRunEnabled();
  });
  pw.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !$<HTMLButtonElement>('run-btn').disabled) run();
  });

  $('toggle-visibility').addEventListener('click', () => {
    const showing = pw.type === 'text';
    pw.type = showing ? 'password' : 'text';
    $('toggle-visibility').classList.toggle('active', !showing);
  });

  $('generate-pass').addEventListener('click', () => {
    const words = 6;
    const phrase = generatePassphrase(words);
    pw.type = 'text';
    pw.value = phrase;
    $('toggle-visibility').classList.add('active');
    updateStrength();
    updateRunEnabled();
    emit('crypto', 'info', `Generated a ${words}-word passphrase (~${Math.round(passphraseEntropyBits(words))} bits of entropy)`);
  });
}

function updateStrength(): void {
  const pw = $<HTMLInputElement>('password').value;
  const wrap = $('strength');
  if (state.mode !== 'lock' || pw.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  const s = estimateStrength(pw);
  const fill = $('strength-fill');
  fill.style.width = `${(s.score / 4) * 100}%`;
  fill.dataset.score = String(s.score);
  $('strength-label').textContent = `${s.label} · ~${s.bits} bits`;
}

function updateRunEnabled(): void {
  const pw = $<HTMLInputElement>('password').value;
  $<HTMLButtonElement>('run-btn').disabled = state.busy || !state.file || pw.length === 0;
}

// ── actions ──────────────────────────────────────────────────────────────────
function wireActions(): void {
  $('run-btn').addEventListener('click', run);
  $('retry-btn').addEventListener('click', () => {
    hide('error');
    $<HTMLInputElement>('password').focus();
  });
  $('drawer-toggle').addEventListener('click', () => {
    document.getElementById('app')?.classList.toggle('drawer-open');
  });
}

let pendingResult: { blob: Blob; name: string; mime: string } | null = null;

function run(): void {
  if (!state.file || state.busy) return;
  const password = $<HTMLInputElement>('password').value;
  if (!password) return;

  state.busy = true;
  state.lastPassword = password;
  hide('result');
  hide('error');
  show('progress');
  setProgress(state.mode === 'lock' ? 'Encrypting' : 'Decrypting', 0, 1);
  setStatus(state.mode === 'lock' ? 'locking…' : 'unlocking…', 'busy');
  updateRunEnabled();
  $<HTMLButtonElement>('run-btn').disabled = true;
  opStart = Date.now();

  const id = ++reqId;
  const compress = state.mode === 'lock' && $<HTMLInputElement>('compress-toggle').checked;
  const req: WorkerRequest =
    state.mode === 'lock'
      ? { kind: 'lock', id, file: state.file, password, compress }
      : { kind: 'unlock', id, file: state.file, password };
  emit('crypto', 'info', `Started ${state.mode} (request #${id})`);
  getWorker().postMessage(req);
}

function handleWorkerMessage(msg: WorkerResponse): void {
  switch (msg.kind) {
    case 'log':
      emit('crypto', msg.level, msg.msg);
      break;
    case 'progress':
      setProgress(msg.phase, msg.done, msg.total);
      break;
    case 'done':
      onDone(msg.blob, msg.name, msg.mime);
      break;
    case 'error':
      showError(msg.message);
      break;
  }
}

function onDone(blob: Blob, name: string, mime: string): void {
  state.busy = false;
  pendingResult = { blob, name, mime };
  hide('progress');
  show('result');
  setStatus('done', 'ok');

  const locked = state.mode === 'lock';
  $('result-icon').textContent = locked ? '🔒' : '🔓';
  $('result-title').textContent = locked ? 'File locked' : 'File unlocked';
  $('result-sub').textContent = `${name} · ${humanSize(blob.size)}`;

  const copyBtn = $<HTMLButtonElement>('copy-pass-btn');
  copyBtn.hidden = !locked;

  const shareBtn = $<HTMLButtonElement>('share-btn');
  shareBtn.hidden = typeof navigator.share !== 'function';

  emit('file', 'ok', `${locked ? 'Locked' : 'Unlocked'} → "${name}" (${humanSize(blob.size)})`);
  updateRunEnabled();
}

function wireResultActions(): void {
  $('download-btn').addEventListener('click', () => {
    if (!pendingResult) return;
    const url = URL.createObjectURL(pendingResult.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pendingResult.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    emit('file', 'ok', `Downloaded "${pendingResult.name}"`);
  });

  $('share-btn').addEventListener('click', async () => {
    if (!pendingResult || typeof navigator.share !== 'function') return;
    try {
      const f = new File([pendingResult.blob], pendingResult.name, { type: pendingResult.mime });
      await navigator.share({ files: [f], title: pendingResult.name });
      emit('file', 'ok', 'Shared via the system share sheet');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') emit('file', 'warn', `Share cancelled or failed: ${(e as Error).message}`);
    }
  });

  $('copy-pass-btn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.lastPassword);
      const btn = $('copy-pass-btn');
      const prev = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = prev), 1500);
      emit('ui', 'ok', 'Password copied to clipboard');
    } catch {
      emit('ui', 'warn', 'Clipboard blocked — copy the password manually');
    }
  });
}

// ── progress / status / error ─────────────────────────────────────────────────
function setProgress(phase: string, done: number, total: number): void {
  const percent = pct(done, total);
  $('progress-phase').textContent = `${phase}… ${percent}%`;
  $('progress-fill').style.width = `${percent}%`;
  const elapsed = Date.now() - opStart;
  const stats = total > 1 ? `${throughput(done, elapsed)} · ETA ${eta(done, total, elapsed)}` : '';
  $('progress-stats').textContent = stats;
}

function showError(message: string): void {
  state.busy = false;
  hide('progress');
  show('error');
  $('error-msg').textContent = message;
  setStatus('error', 'err');
  emit('crypto', 'err', message);
  updateRunEnabled();
}

function setStatus(label: string, level: 'idle' | 'busy' | 'ok' | 'err'): void {
  $('status-label').textContent = label;
  $('status-dot').className = `dot-mini ${level}`;
}

function show(id: string): void {
  $(id).hidden = false;
}
function hide(id: string): void {
  $(id).hidden = true;
}

// ── modals ───────────────────────────────────────────────────────────────────
function wireModals(): void {
  const overlay = $('modal-overlay');
  const body = $('modal-body');

  document.querySelectorAll<HTMLElement>('[data-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tmplId = btn.dataset.modal!;
      const tmpl = document.getElementById(tmplId) as HTMLTemplateElement | null;
      if (!tmpl) return;
      body.innerHTML = '';
      body.appendChild(tmpl.content.cloneNode(true));
      overlay.hidden = false;
      emit('ui', 'info', `Opened "${tmplId.replace('tmpl-', '')}"`);
    });
  });

  const close = () => {
    overlay.hidden = true;
  };
  $('modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) close();
  });
}

// ── service worker (offline) ──────────────────────────────────────────────────
function registerServiceWorker(): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => emit('system', 'ok', 'Offline mode ready — works without a connection'))
        .catch(() => emit('system', 'warn', 'Service worker registration failed (offline mode unavailable)'));
    });
  }
}

// ── go ──────────────────────────────────────────────────────────────────────
init();
wireResultActions();
registerServiceWorker();
