import type { EmbeddingProvider } from '../ports/embedding.js';
import type { Reranker } from '../ports/reranker.js';
import type { ScoredChunk, VectorStore } from '../ports/vector-store.js';
import { identityReranker } from './rerank.js';
import { reciprocalRankFusion } from './rrf.js';
import { textSearch } from './text-search.js';
import { vectorSearch } from './vector-search.js';

export interface RetrieveDeps {
  store: VectorStore;
  embedder: EmbeddingProvider;
  reranker?: Reranker;
}

export interface RetrieveOptions {
  /** Candidatos por ramo antes da fusão. */
  candidates?: number;
  /** Quantos chunks seguem para o reranker. */
  rerankPool?: number;
  topK?: number;
}

/** Busca híbrida: vetorial + textual em paralelo → RRF → rerank. */
export async function retrieve(query: string, deps: RetrieveDeps, opts: RetrieveOptions = {}): Promise<ScoredChunk[]> {
  const candidates = opts.candidates ?? 30;
  const pool = opts.rerankPool ?? 20;
  const topK = opts.topK ?? 5;
  const [vec, txt] = await Promise.all([vectorSearch(query, deps, candidates), textSearch(query, deps, candidates)]);
  const fused = reciprocalRankFusion([vec, txt]).slice(0, pool);
  return (deps.reranker ?? identityReranker).rerank(query, fused, topK);
}
