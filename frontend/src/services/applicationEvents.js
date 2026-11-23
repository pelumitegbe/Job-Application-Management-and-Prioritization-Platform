// A tiny "applications changed" signal. The application service emits it after
// a successful create, update or delete, so views that derive data from all
// applications (priorities, Top priorities) can refresh without a global store.

const target = new EventTarget();
const EVENT = 'applications-changed';

export function notifyApplicationsChanged(change) {
  target.dispatchEvent(new CustomEvent(EVENT, { detail: change }));
}

/** Subscribes to changes. Returns the unsubscribe function (use it as an effect cleanup). */
export function onApplicationsChanged(listener) {
  const handler = (event) => listener(event.detail);
  target.addEventListener(EVENT, handler);
  return () => target.removeEventListener(EVENT, handler);
}
