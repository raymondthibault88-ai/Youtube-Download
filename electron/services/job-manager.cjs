const nodeCrypto = require('node:crypto');

class JobManager {
  constructor({ channel }) {
    this.channel = channel;
    this.current = null;
    this.subscribers = new Set();
  }

  subscribe(sender) {
    if (sender && !sender.isDestroyed()) this.subscribers.add(sender);
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
    Object.assign(this.current, patch, { updatedAt: Date.now(), revision: this.current.revision + 1 });
    const snapshot = this.snapshot();
    for (const sender of this.subscribers) {
      if (sender.isDestroyed()) this.subscribers.delete(sender);
      else sender.send(this.channel, snapshot);
    }
  }

  update(jobId, patch) {
    if (this.current?.id !== jobId || this.current.state !== 'running') return;
    this.emit(patch);
  }

  async start(type, sender, executor, { timeoutMs = type === 'analysis' ? 60_000 : 0 } = {}) {
    if (this.current && ['running', 'cancelling'].includes(this.current.state)) {
      const labels = { analysis: 'd’analyse', download: 'de téléchargement', conversion: 'de conversion' };
      throw new Error(`Une tâche ${labels[this.current.type]} est déjà en cours.`);
    }

    const controller = new AbortController();
    const timeout = timeoutMs > 0 ? setTimeout(() => {
      const error = new Error('L’analyse a dépassé le délai prévu. Réessaie.');
      error.name = 'TimeoutError';
      controller.abort(error);
    }, timeoutMs) : null;
    this.subscribe(sender);
    const id = nodeCrypto.randomUUID();
    this.current = {
      id,
      type,
      state: 'running',
      percent: 0,
      speed: null,
      eta: null,
      raw: type === 'analysis' ? 'Analyse des formats YouTube…' : type === 'download' ? 'Préparation du téléchargement…' : 'Préparation de la conversion…',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      revision: 0,
      result: null,
      error: null,
      controller,
      sender
    };
    this.emit();

    const update = (patch) => this.update(id, patch);
    try {
      const result = await executor({ signal: controller.signal, update, jobId: id });
      this.emit({ state: 'completed', percent: 100, speed: null, eta: null, raw: type === 'analysis' ? 'Analyse terminée.' : type === 'download' ? 'Téléchargement terminé.' : 'Conversion terminée.', result });
      return result;
    } catch (error) {
      const failure = controller.signal.reason?.name === 'TimeoutError' ? controller.signal.reason : error;
      const cancelled = (controller.signal.aborted && failure?.name !== 'TimeoutError') || failure?.name === 'AbortError';
      this.emit({
        state: cancelled ? 'cancelled' : 'failed',
        speed: null,
        eta: null,
        raw: cancelled ? 'Opération annulée.' : 'La tâche a échoué.',
        error: cancelled ? null : String(failure?.message || failure)
      });
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
  }

  cancel() {
    if (!this.current || this.current.state !== 'running') return false;
    this.emit({ state: 'cancelling', raw: 'Annulation en cours…' });
    this.current.controller.abort();
    return true;
  }
}

module.exports = { JobManager };
