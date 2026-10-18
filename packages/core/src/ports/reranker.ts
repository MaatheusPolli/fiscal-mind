import type { ScoredChunk } from './vector-store.js';

export interface Reranker {
  rerank(query: string, candidates: ScoredChunk[], topK: number): Promise<ScoredChunk[]>;
}
