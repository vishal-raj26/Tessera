// The opening mosaic's once-per-session rule, without React, so it's tested on its own.

/**
 * Whether the opening plays: not with reduced motion, and once per session (sessionStorage). Pure, so it's
 * tested on its own; `storage` is null when the browser has none (then it plays this once).
 */
export function decideMosaic(reducedMotion: boolean, storage: { get(): string | null; set(): void } | null): boolean {
  if (reducedMotion) return false;
  if (storage) {
    if (storage.get()) return false;
    storage.set();
  }
  return true;
}

