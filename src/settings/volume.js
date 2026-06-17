const VOLUME_STORAGE_KEY = 'bs2d-preview-volume';
const DEFAULT_VOLUME = 40;

export function loadSavedVolume() {
  try {
    const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (saved == null) return DEFAULT_VOLUME;
    const value = parseInt(saved, 10);
    if (!Number.isFinite(value)) return DEFAULT_VOLUME;
    return Math.max(0, Math.min(100, value));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveVolume(value) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(Math.max(0, Math.min(100, value))));
  } catch {
    /* private browsing 等 */
  }
}
