export function buildSearchCacheKey(sourceCode, query) {
  return `${String(sourceCode || "unknown").toLowerCase()}:${JSON.stringify(query?.toObject?.() || query || {})}`;
}

export class InMemorySearchCache {
  constructor({ ttlMs = 30000 } = {}) {
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear() {
    this.entries.clear();
  }
}

export default InMemorySearchCache;