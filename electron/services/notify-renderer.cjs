function notifyRenderer(target, channel, payload) {
  // A renderer may disappear or reload between the state check and send.
  try {
    if (!target || target.isDestroyed()) return false;
    target.send(channel, payload);
    return true;
  } catch {
    // Notifications are best effort; the main process keeps the current state.
    return false;
  }
}

module.exports = { notifyRenderer };
