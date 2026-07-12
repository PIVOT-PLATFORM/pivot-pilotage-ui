/**
 * Setup de test de la lib pilotage-ui. L'environnement du runner ne fournit pas
 * `localStorage` (API `window`) — Angular pose bien un DOM pour les composants, mais pas
 * ce stockage. On le polyfill (en mémoire) uniquement s'il est absent, pour les services
 * qui l'utilisent (ex. RoadmapTimeScaleService). Aucun effet en navigateur réel.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
}
