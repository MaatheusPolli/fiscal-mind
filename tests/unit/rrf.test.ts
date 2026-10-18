import { describe, expect, it } from 'vitest';
import type { Chunk } from '../../packages/core/src/domain/chunk.js';
import { reciprocalRankFusion } from '../../packages/core/src/retrieval/rrf.js';
import type { ScoredChunk } from '../../packages/core/src/ports/vector-store.js';

const c = (id: string): Chunk => ({ id, documentId: 'd', text: id, section: 's', page: 1, kind: 'prose', metadata: {} });
const list = (...ids: string[]): ScoredChunk[] => ids.map((id, i) => ({ chunk: c(id), score: 100 - i }));

describe('reciprocalRankFusion', () => {
  it('prioriza itens bem posicionados nas duas listas', () => {
    const fused = reciprocalRankFusion([list('a', 'b', 'c', 'd'), list('c', 'a', 'e')]);
    expect(fused.map((f) => f.chunk.id)).toEqual(['a', 'c', 'b', 'e', 'd']);
  });

  it('calcula 1/(k+rank) somado', () => {
    const [top] = reciprocalRankFusion([list('a'), list('a')], 60);
    expect(top!.score).toBeCloseTo(2 / 61);
  });

  it('ignora a escala dos scores originais', () => {
    const vec: ScoredChunk[] = [{ chunk: c('x'), score: 0.9 }, { chunk: c('y'), score: 0.8 }];
    const txt: ScoredChunk[] = [{ chunk: c('y'), score: 1000 }, { chunk: c('x'), score: 1 }];
    const fused = reciprocalRankFusion([vec, txt]);
    expect(fused[0]!.score).toBe(fused[1]!.score);
    expect(fused.map((f) => f.chunk.id)).toEqual(['x', 'y']); // desempate estável por id
  });

  it('lida com listas vazias', () => {
    expect(reciprocalRankFusion([[], []])).toEqual([]);
  });
});
