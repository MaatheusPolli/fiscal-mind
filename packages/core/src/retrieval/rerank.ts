import type { Reranker } from '../ports/reranker.js';
import type { ScoredChunk } from '../ports/vector-store.js';

/** Mantém a ordem recebida (útil sem reranker configurado e em testes). */
export const identityReranker: Reranker = {
  async rerank(_query, candidates, topK) {
    return candidates.slice(0, topK);
  },
};

/**
 * Reranker genérico sobre uma função de relevância (cross-encoder, API de rerank ou LLM).
 * `score` recebe os textos e devolve uma nota por texto, na mesma ordem.
 */
export function scoringReranker(score: (query: string, texts: string[]) => Promise<number[]>): Reranker {
  return {
    async rerank(query, candidates, topK) {
      if (candidates.length === 0) return [];
      const scores = await score(query, candidates.map((c) => `${c.chunk.section}\n${c.chunk.text}`));
      if (scores.length !== candidates.length) throw new Error('Reranker retornou quantidade inesperada de notas');
      return candidates
        .map((c, i): ScoredChunk => ({ chunk: c.chunk, score: scores[i]! }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
  };
}
