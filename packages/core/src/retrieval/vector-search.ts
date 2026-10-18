import type { EmbeddingProvider } from '../ports/embedding.js';
import type { ScoredChunk, VectorStore } from '../ports/vector-store.js';

export async function vectorSearch(
  query: string,
  deps: { store: VectorStore; embedder: EmbeddingProvider },
  k: number,
): Promise<ScoredChunk[]> {
  const [embedding] = await deps.embedder.embed([query], 'query');
  if (!embedding) throw new Error('Embedder não retornou vetor para a consulta');
  return deps.store.vectorSearch(embedding, k);
}
