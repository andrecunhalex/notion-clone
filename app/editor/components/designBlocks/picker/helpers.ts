/** True when keyboard focus is inside a contentEditable / input — used to
 *  decide whether the picker's keyboard handler should let the event flow. */
export function isEditableFocused(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

export function generateItemId(): string {
  return `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
