// lib/recipeSync.ts

export type RecipeMutation = {
  id: string;
  heartDelta?: number;
  bookmarkDelta?: number;
  heartedByMe?: boolean;
  bookmarkedByMe?: boolean;
};

const EVENT = 'recipe-mutation';

// Some older Safari iOS builds can lack a proper CustomEvent constructor in certain contexts.
// Polyfill defensively — but only in the browser.
function ensureCustomEvent() {
  if (typeof window === 'undefined') return;
  try {
    // Test constructing once; if it throws, we polyfill.
    // eslint-disable-next-line no-new
    new CustomEvent(EVENT);
  } catch {
    // Minimal polyfill
    // @ts-expect-error: assigning polyfill
    window.CustomEvent = function (type: string, params?: any) {
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(type, params?.bubbles ?? false, params?.cancelable ?? false, params?.detail);
      return evt;
    };
  }
}

// Emit (no-op on server; never throw)
export function emitRecipeMutation(m: RecipeMutation) {
  try {
    if (typeof window === 'undefined') return;
    ensureCustomEvent();
    window.dispatchEvent(new CustomEvent<RecipeMutation>(EVENT, { detail: m }));
  } catch {
    // best-effort: ignore
  }
}

// Subscribe (safe on server; returns a no-op unsubscribe)
export function subscribeRecipeMutations(handler: (m: RecipeMutation) => void) {
  if (typeof window === 'undefined') return () => {};
  ensureCustomEvent();

  const fn = (e: Event) => {
    try {
      const ev = e as CustomEvent<RecipeMutation>;
      if (ev?.detail) handler(ev.detail);
    } catch {
      // swallow any handler errors so we don't crash the app
    }
  };

  window.addEventListener(EVENT, fn as EventListener);
  return () => window.removeEventListener(EVENT, fn as EventListener);
}
