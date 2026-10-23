const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** The controls inside `root` that Tab can reach right now: not disabled, not hidden, not under an inert ancestor. */
export function focusStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);
}

/** Makes Tab loop inside `root`: from the last control to the first, and Shift+Tab the other way. Returns true when it moved focus. */
export function loopTab(e: { key: string; shiftKey: boolean; preventDefault: () => void }, root: HTMLElement): boolean {
  if (e.key !== "Tab") return false;
  const stops = focusStops(root);
  if (stops.length === 0) return false;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const at = document.activeElement;
  const outside = !root.contains(at);
  if (e.shiftKey && (at === first || outside)) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (at === last || outside)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
