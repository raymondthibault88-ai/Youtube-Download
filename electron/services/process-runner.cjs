const { spawn } = require('node:child_process');

const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;

function appendTail(current, chunk, limit = DEFAULT_OUTPUT_LIMIT) {
  return `${current}${chunk.toString()}`.slice(-limit);
}

function createAbortError() {
  const error = new Error('Opération annulée.');
  error.name = 'AbortError';
  return error;
}

function terminateChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    killer.unref();
    return;
  }

  child.kill('SIGTERM');
  const forceTimer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  }, 2500);
  forceTimer.unref();
}

function runProcess(command, args, options = {}) {
  const {
    env,
    cwd,
    signal,
    onStdout,
    onStderr,
    outputLimit = DEFAULT_OUTPUT_LIMIT,
    acceptedExitCodes = [0]
  } = options;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const child = spawn(command, args, { cwd, env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const abort = () => terminateChild(child);
    signal?.addEventListener('abort', abort, { once: true });

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
      signal?.removeEventListener('abort', abort);
      reject(signal?.aborted ? createAbortError() : error);
    });

    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) {
        reject(createAbortError());
      } else if (!acceptedExitCodes.includes(code)) {
        reject(new Error(stderr.trim() || `Commande échouée avec le code ${code}.`));
      } else {
        resolve({ stdout, stderr, code });
      }
    });
  });
}

module.exports = { appendTail, createAbortError, runProcess };
