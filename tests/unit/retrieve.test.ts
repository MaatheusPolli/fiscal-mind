import { describe, expect, it, vi } from 'vitest';
import type { Chunk } from '../../packages/core/src/domain/chunk.js';
import type { ScoredChunk, VectorStore } from '../../packages/core/src/ports/vector-store.js';
import { identityReranker, scoringReranker } from '../../packages/core/src/retrieval/rerank.js';
import { retrieve } from '../../packages/core/src/retrieval/retrieve.js';
import { normalizeTextQuery, textSearch } from '../../packages/core/src/retrieval/text-search.js';
import { vectorSearch } from '../../packages/core/src/retrieval/vector-search.js';

const c = (id: string, text = id): Chunk => ({ id, documentId: 'd', text, section: 's', page: 1, kind: 'prose', metadata: {} });
const sc = (...ids: string[]): ScoredChunk[] => ids.map((id) => ({ chunk: c(id), score: 1 }));

function store(vec: ScoredChunk[], txt: ScoredChunk[]): VectorStore {
  return {
    getDocument: async () => null,
    replaceDocument: async () => {},
    vectorSearch: vi.fn(async () => vec),
    textSearch: vi.fn(async () => txt),
    findByRejectionCode: async () => [],
  };
}
const embedder = { dimensions: 1, embed: vi.fn(async (t: string[]) => t.map(() => [1])) };

describe('retrieve', () => {
  it('funde ramos vetorial e textual e respeita topK', async () => {
    const s = store(sc('a', 'b', 'c'), sc('b', 'd'));
    const out = await retrieve('pergunta', { store: s, embedder }, { topK: 2, candidates: 7 });
    expect(out.map((o) => o.chunk.id)).toEqual(['b', 'a']);
    expect(s.vectorSearch).toHaveBeenCalledWith([1], 7);
    expect(s.textSearch).toHaveBeenCalledWith('pergunta', 7);
    expect(embedder.embed).toHaveBeenCalledWith(['pergunta'], 'query');
  });

  it('aplica o reranker sobre o pool fundido', async () => {
    const reranker = scoringReranker(async (_q, texts) => texts.map((t) => (t.endsWith('d') ? 10 : 0)));
    const out = await retrieve('q', { store: store(sc('a', 'b'), sc('d')), embedder, reranker }, { topK: 1 });
    expect(out[0]!.chunk.id).toBe('d');
  });

  it('limita o pool enviado ao reranker', async () => {
    const rerank = vi.fn(identityReranker.rerank);
    await retrieve('q', { store: store(sc('a', 'b', 'c'), []), embedder, reranker: { rerank } }, { rerankPool: 2 });
    expect(rerank.mock.calls[0]![1]).toHaveLength(2);
  });
});

describe('scoringReranker', () => {
  it('retorna vazio sem candidatos e valida contagem', async () => {
    const r = scoringReranker(async () => [1]);
    expect(await r.rerank('q', [], 3)).toEqual([]);
    await expect(r.rerank('q', sc('a', 'b'), 3)).rejects.toThrow();
  });
});

describe('text/vector search', () => {
  it('normaliza operadores de full-text', () => {
    expect(normalizeTextQuery('  rejeição 539 & (duplicidade)! ')).toBe('rejeição 539 duplicidade');
  });
  it('não consulta o banco com consulta vazia', async () => {
    const s = store([], []);
    expect(await textSearch('?!', { store: s }, 5)).toEqual([]);
    expect(s.textSearch).not.toHaveBeenCalled();
  });
  it('falha se o embedder não devolver vetor', async () => {
    const bad = { dimensions: 1, embed: async () => [] };
    await expect(vectorSearch('q', { store: store([], []), embedder: bad }, 3)).rejects.toThrow();
  });
});
