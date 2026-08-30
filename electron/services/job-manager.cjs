const nodeCrypto = require('node:crypto');

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
    if (sender && !sender.isDestroyed()) sender.send(this.channel, snapshot);
  }

  update(jobId, patch) {
    if (this.current?.id !== jobId || this.current.state !== 'running') return;
    this.emit(patch);
  }

  async start(type, sender, executor) {
    if (this.current && ['running', 'cancelling'].includes(this.current.state)) {
      throw new Error(`Une tâche ${this.current.type === 'download' ? 'de téléchargement' : 'de conversion'} est déjà en cours.`);
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
    this.emit();

    const update = (patch) => this.update(id, patch);
    try {
      const result = await executor({ signal: controller.signal, update, jobId: id });
      this.emit({ state: 'completed', percent: 100, speed: null, eta: null, raw: type === 'download' ? 'Téléchargement terminé.' : 'Conversion terminée.', result });
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
