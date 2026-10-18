import type { ScoredChunk, VectorStore } from '../ports/vector-store.js';

/** Remove pontuação que o parser de full-text interpretaria como operador. */
export function normalizeTextQuery(query: string): string {
  return query.replace(/[^\p{L}\p{N}\s.-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export async function textSearch(query: string, deps: { store: VectorStore }, k: number): Promise<ScoredChunk[]> {
  const q = normalizeTextQuery(query);
  if (!q) return [];
  return deps.store.textSearch(q, k);
}
