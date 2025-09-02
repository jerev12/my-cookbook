// lib/recipeSync.ts
export type RecipeMutation = {
  id: string;
  heartDelta?: number;          // +1 / -1 (optional)
  bookmarkDelta?: number;       // +1 / -1 (optional)
  heartedByMe?: boolean;        // new boolean state (optional)
  bookmarkedByMe?: boolean;     // new boolean state (optional)
};

const EVENT = 'recipe-mutation';

export function emitRecipeMutation(m: RecipeMutation) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: m }));
}

export function subscribeRecipeMutations(
  handler: (m: RecipeMutation) => void
) {
  if (typeof window === 'undefined') return () => {};
  const fn = (e: Event) => handler((e as CustomEvent<RecipeMutation>).detail);
  window.addEventListener(EVENT, fn as EventListener);
  return () => window.removeEventListener(EVENT, fn as EventListener);
}
