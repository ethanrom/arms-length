/**
 * The 18+ confirmation for own-photo mode (expert panel triage, 2026-10-21, item 3). CheckMine stores it in sessionStorage
 * for this tab only, so the live page can read it instead of asking twice; it is never sent anywhere.
 */
export const ADULT_STORAGE_KEY = "arms-length:adult-confirmed";

export function isAdultConfirmed(storage: Pick<Storage, "getItem"> = window.sessionStorage): boolean {
  return storage.getItem(ADULT_STORAGE_KEY) === "1";
}
