// @ts-nocheck
/**
 * Framework-agnostic toast event bus.
 *
 * A tiny pub/sub singleton so plain (non-React) modules — the client
 * repositories in `src/data/` — can surface user-facing feedback without
 * importing React. The `<ToastViewport>` component subscribes to this bus,
 * renders incoming toasts, and handles auto-dismiss. See issue #52.
 *
 * Safe to import during SSR: it only manipulates an in-memory listener list
 * and never touches `window`. With no listeners mounted, `pushToast` is a
 * no-op.
 *
 * @typedef {'success' | 'error' | 'info'} ToastType
 * @typedef {Object} Toast
 * @property {number} id       Monotonic id, unique per emitted toast.
 * @property {ToastType} type
 * @property {string} message
 * @property {number} [duration] Auto-dismiss ms; omit for the viewport default.
 */

/** @type {Set<(toast: Toast) => void>} */
const listeners = new Set();
let counter = 0;

/**
 * Register a listener for new toasts. Returns an unsubscribe function.
 * @param {(toast: Toast) => void} listener
 * @returns {() => void}
 */
export function subscribeToasts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Emit a toast to every subscribed listener.
 * @param {{ type?: ToastType, message: string, duration?: number }} toast
 * @returns {number} the emitted toast's id
 */
export function pushToast({ type = 'info', message, duration } = {}) {
  const entry = { id: ++counter, type, message, duration };
  for (const listener of listeners) listener(entry);
  return entry.id;
}

/**
 * Convenience helpers for the common toast types. Each returns the toast id.
 */
export const toast = {
  /** @param {string} message @param {{ duration?: number }} [opts] */
  success: (message, opts = {}) => pushToast({ ...opts, type: 'success', message }),
  /** @param {string} message @param {{ duration?: number }} [opts] */
  error: (message, opts = {}) => pushToast({ ...opts, type: 'error', message }),
  /** @param {string} message @param {{ duration?: number }} [opts] */
  info: (message, opts = {}) => pushToast({ ...opts, type: 'info', message }),
};

export default toast;
