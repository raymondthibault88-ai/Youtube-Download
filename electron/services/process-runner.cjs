const { spawn } = require('node:child_process');

const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;
const activeProcesses = new Set();

function appendTail(current, chunk, limit = DEFAULT_OUTPUT_LIMIT) {
  return `${current}${chunk.toString()}`.slice(-limit);
}

function createAbortError() {
  const error = new Error('Opération annulée.');
  error.name = 'AbortError';
  return error;
}

function waitForPromise(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function terminateChild(child) {
  if (!child?.pid) return Promise.resolve();
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      killer.once('error', () => { child.kill(); resolve(); });
      killer.once('close', resolve);
    });
  }
  const killGroup = (signal) => {
    try { process.kill(-child.pid, signal); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  killGroup('SIGTERM');
  // The parent may close before a descendant using detached stdio exits.
  return new Promise((resolve) => setTimeout(() => { killGroup('SIGKILL'); resolve(); }, 750));
}

async function terminateAllProcesses() {
  const processes = [...activeProcesses];
  await Promise.all(processes.map((entry) => entry.stop()));
  await Promise.all(processes.map((entry) => entry.closed));
}

function runProcess(command, args, options = {}) {
  const {
    env,
    cwd,
    signal,
    onStdout,
    onStderr,
    outputLimit = DEFAULT_OUTPUT_LIMIT,
    acceptedExitCodes = [0],
    timeoutMs = 0
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const child = spawn(command, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32' });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let termination = null;
    let timedOut = false;
    let stopped = false;
    let markClosed;
    const entry = { closed: new Promise((resolve) => { markClosed = resolve; }), stop: () => {
      stopped = true;
      termination ||= terminateChild(child);
      return termination;
    } };
    activeProcesses.add(entry);
    const abort = () => { void entry.stop(); };
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = timeoutMs > 0 ? setTimeout(() => { timedOut = true; abort(); }, timeoutMs) : null;
    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      activeProcesses.delete(entry);
      markClosed();
    };

    child.stdout?.on('data', (chunk) => {
      stdout = appendTail(stdout, chunk, outputLimit);
      onStdout?.(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendTail(stderr, chunk, outputLimit);
      onStderr?.(chunk);
    });

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(signal?.aborted ? createAbortError() : error);
    });

    child.once('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      await termination;
      cleanup();
      if (timedOut) {
        const error = new Error(`Le moteur n’a pas répondu dans le délai prévu (${Math.round(timeoutMs / 1000)} s). Réessaie.`);
        error.name = 'TimeoutError';
        reject(error);
      } else if (signal?.aborted || stopped) {
        reject(createAbortError());
      } else if (!acceptedExitCodes.includes(code)) {
        reject(new Error(stderr.trim() || `Commande échouée avec le code ${code}.`));
      } else {
        resolve({ stdout, stderr, code });
      }
    });
  });
}

module.exports = { appendTail, createAbortError, runProcess, terminateAllProcesses, waitForPromise };
