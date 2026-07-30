export const CAFE_LEVEL_ID = 'london-cafe';
export const CAFE_RECOVERY_CACHE_KEY = 'smart-parrot:london-cafe:v1';
export const CAFE_RECOVERY_CACHE_VERSION = 1;

export function writeCafeRecoveryCache(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CAFE_RECOVERY_CACHE_KEY, JSON.stringify({
      cacheVersion: CAFE_RECOVERY_CACHE_VERSION,
      levelId: CAFE_LEVEL_ID,
      authority: 'temporary-local-recovery-only',
      updatedAt: new Date().toISOString(),
      state,
    }));
  } catch {
    // Recovery cache is best-effort and never authoritative.
  }
}

export function readCafeRecoveryCache() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CAFE_RECOVERY_CACHE_KEY));
    if (
      parsed?.cacheVersion !== CAFE_RECOVERY_CACHE_VERSION
      || parsed?.levelId !== CAFE_LEVEL_ID
      || parsed?.authority !== 'temporary-local-recovery-only'
    ) return null;
    return parsed.state ?? null;
  } catch {
    return null;
  }
}

export function clearCafeRecoveryCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CAFE_RECOVERY_CACHE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
