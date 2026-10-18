import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashEmbedder } from '../../packages/core/src/adapters/hash-embedder.js';
import { MemoryVectorStore, tokenize } from '../../packages/core/src/adapters/memory-store.js';
import type { Chunk } from '../../packages/core/src/domain/chunk.js';
import { isCorrect, isGrounded, mean, recallAtK } from '../../packages/core/src/eval/metrics.js';
import { runEval } from '../../packages/core/src/eval/run-eval.js';
import { ingestDocument, type IngestInput } from '../../packages/core/src/ingest/pipeline.js';
import type { LlmClient } from '../../packages/core/src/ports/llm.js';

const c = (id: string, text: string): Chunk => ({ id, documentId: 'd', text, section: 's', page: 1, kind: 'prose', metadata: {} });

describe('métricas', () => {
  it('recall@k conta fontes encontradas no top-k, ignorando acentos/caixa', () => {
    const r = [c('1', 'Prazo de CANCELAMENTO'), c('2', 'outra'), c('3', 'Carta de correção')];
    expect(recallAtK(r, ['prazo de cancelamento', 'carta de correcao'], 3)).toBe(1);
    expect(recallAtK(r, ['prazo de cancelamento', 'carta de correcao'], 2)).toBe(0.5);
    expect(recallAtK(r, [], 2)).toBe(1);
  });

  it('groundedness e correção', () => {
    const ans = { route: 'rag' as const, kind: 'answer' as const, resposta: 'Até 24 horas.', citacoes: [{ chunk: c('1', 'x'), trecho: 'x' }], descartadas: 0, contexto: [] };
    expect(isGrounded(ans)).toBe(true);
    expect(isGrounded({ ...ans, descartadas: 1 })).toBe(false);
    expect(isCorrect(ans, ['24 HORAS'])).toBe(true);
    expect(isCorrect(ans, ['48 horas'])).toBe(false);
    const refusal = { route: 'rag' as const, kind: 'refusal' as const, motivo: 'sem-contexto' as const, resposta: '', contexto: [] };
    expect(isGrounded(refusal)).toBe(false);
    expect(isCorrect(refusal)).toBe(false);
    expect(mean([])).toBe(0);
  });
});

describe('MemoryVectorStore', () => {
  it('tokeniza sem acentos, stopwords e plural simples', () => {
    expect(tokenize('As Notas de Contingência')).toEqual(['nota', 'contingencia']);
  });

  it('BM25 prioriza termos raros e busca por código prioriza linha de tabela', async () => {
    const s = new MemoryVectorStore();
    await s.replaceDocument({ id: 'd', name: 'd', version: '1', contentHash: 'h' }, [
      { chunk: c('a', 'nota fiscal nota fiscal'), embedding: [1, 0] },
      { chunk: c('b', 'nota fiscal cancelamento'), embedding: [0, 1] },
      { chunk: { ...c('t', '539 | Rejeição'), kind: 'table-row', page: 9, metadata: { rejectionCode: '539' } }, embedding: [1, 1] },
      { chunk: { ...c('p', 'rejeição 539'), metadata: { rejectionCode: '539' } }, embedding: [1, 1] },
    ]);
    expect((await s.textSearch('cancelamento da nota', 2))[0]!.chunk.id).toBe('b');
    expect(await s.textSearch('de a', 2)).toEqual([]);
    expect((await s.vectorSearch([0, 1], 1))[0]!.chunk.id).toBe('b');
    expect((await s.findByRejectionCode('539')).map((x) => x.id)).toEqual(['t', 'p']);
  });
});

describe('avaliação offline (regressão)', () => {
  const cases = readFileSync('data/eval/perguntas.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const baseline = JSON.parse(readFileSync('data/eval/baseline.json', 'utf8'));

  async function setup() {
    const store = new MemoryVectorStore();
    const embedder = hashEmbedder();
    const corpus = JSON.parse(readFileSync('tests/fixtures/corpus-sintetico.json', 'utf8')) as IngestInput;
    await ingestDocument(corpus, { store, embedder });
    return { store, embedder };
  }

  it('recall@5 não cai abaixo do baseline', async () => {
    const { summary } = await runEval(cases, await setup());
    expect(summary.recallAtK).toBeGreaterThanOrEqual(baseline.recallAtK);
    expect(summary.groundedness).toBeUndefined();
  });

  it('com LLM simulado calcula groundedness, correção e recusas', async () => {
    // LLM "oráculo": cita o primeiro trecho do contexto; recusa quando a pergunta é fora do escopo.
    const llm: LlmClient = {
      async answer({ messages }) {
        const content = messages[0]!.content;
        const outOfScope = /imposto de renda|CT-e|lucro presumido/.test(content.split('<pergunta>')[1]!);
        const m = /<trecho id="([^"]+)"[^>]*>\n([^\n]+)/.exec(content)!;
        return outOfScope
          ? { encontrado: false, resposta: 'Não encontrei.', citacoes: [] }
          : { encontrado: true, resposta: m[2]!, citacoes: [{ chunkId: m[1]!, trecho: m[2]!.slice(0, 20) }] };
      },
    };
    const { summary, results } = await runEval(cases, { ...(await setup()), llm });
    expect(summary.groundedness).toBe(1);
    expect(summary.refusalAccuracy).toBe(1);
    expect(summary.correctness).toBeGreaterThan(0.5);
    expect(results.find((r) => r.id === 'q03')!.answer!.route).toBe('rejection-lookup');
  });
});
