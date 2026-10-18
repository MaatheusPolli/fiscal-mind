import type { ScoredChunk } from '../ports/vector-store.js';

/**
 * Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank_i(d)), rank começando em 1.
 * Ignora os scores originais — só a posição importa, o que torna listas de escalas diferentes comparáveis.
 */
export function reciprocalRankFusion(lists: ScoredChunk[][], k = 60): ScoredChunk[] {
  const fused = new Map<string, ScoredChunk>();
  for (const list of lists) {
    list.forEach(({ chunk }, i) => {
      const prev = fused.get(chunk.id);
      const add = 1 / (k + i + 1);
      fused.set(chunk.id, { chunk, score: (prev?.score ?? 0) + add });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
}
