const nodeCrypto = require('node:crypto');
const { createAbortError } = require('./process-runner.cjs');
const { notifyRenderer } = require('./notify-renderer.cjs');

class JobManager {
  constructor({ channel }) {
    this.channel = channel;
    this.current = null;
  }

  snapshot() {
    if (!this.current) return null;
    const snapshot = { ...this.current };
    delete snapshot.controller;
    delete snapshot.sender;
    return snapshot;
  }

  emit(patch = {}) {
    if (!this.current) return;
    Object.assign(this.current, patch, { updatedAt: Date.now() });
    const snapshot = this.snapshot();
    const sender = this.current.sender;
    notifyRenderer(sender, this.channel, snapshot);
  }

  update(jobId, patch) {
    if (this.current?.id !== jobId || this.current.state !== 'running') return;
    const next = { ...patch };
    if (typeof next.percent === 'number' && Number.isFinite(next.percent)) {
      next.percent = Math.max(this.current.percent, Math.min(99, next.percent));
    } else {
      delete next.percent;
    }
    this.emit(next);
  }

  async start(type, sender, executor) {
    if (sender?.isDestroyed?.()) throw createAbortError();
    if (this.current && ['running', 'cancelling'].includes(this.current.state)) {
      throw new Error(
        `Une tâche ${this.current.type === 'download' ? 'de téléchargement' : 'de conversion'} est déjà en cours.`
      );
    }

    const controller = new AbortController();
    const id = nodeCrypto.randomUUID();
    this.current = {
      id,
      type,
      state: 'running',
      percent: 0,
      speed: null,
      eta: null,
      raw: type === 'download' ? 'Préparation du téléchargement…' : 'Préparation de la conversion…',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      result: null,
      error: null,
      controller,
      sender
    };
    const update = (patch) => this.update(id, patch);
    const onDestroyed = () => controller.abort();
    sender?.once?.('destroyed', onDestroyed);
    try {
      this.emit();
      if (controller.signal.aborted || sender?.isDestroyed?.()) throw createAbortError();
      const result = await executor({ signal: controller.signal, update, jobId: id });
      this.emit({
        state: 'completed',
        percent: 100,
        speed: null,
        eta: null,
        raw: type === 'download' ? 'Téléchargement terminé.' : 'Conversion terminée.',
        result
      });
      return result;
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError';
      this.emit({
        state: cancelled ? 'cancelled' : 'failed',
        speed: null,
        eta: null,
        raw: cancelled ? 'Opération annulée.' : 'La tâche a échoué.',
        error: cancelled ? null : String(error?.message || error)
      });
      throw error;
    } finally {
      sender?.removeListener?.('destroyed', onDestroyed);
    }
  }

  cancel() {
    if (!this.current || this.current.state !== 'running') return false;
    this.emit({ state: 'cancelling', raw: 'Annulation en cours…' });
    this.current.controller.abort();
    return true;
  }

  async shutdown() {
    this.cancel();
    if (!this.current || !['running', 'cancelling'].includes(this.current.state)) return;
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        if (!this.current || !['running', 'cancelling'].includes(this.current.state)) {
          clearInterval(timer);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
      const timeout = setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 5000);
    });
  }
}

module.exports = { JobManager };
