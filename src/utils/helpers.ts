export const nextIdleTick =
  import.meta.client && window && 'requestIdleCallback' in window ? window.requestIdleCallback : setTimeout
