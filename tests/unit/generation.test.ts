import { describe, expect, it, vi } from 'vitest';
import type { Chunk } from '../../packages/core/src/domain/chunk.js';
import { partialResposta, parseAnswerInput } from '../../packages/core/src/adapters/claude-llm.js';
import { ask } from '../../packages/core/src/generation/answer.js';
import { buildAnswerPrompt } from '../../packages/core/src/generation/prompts/answer.js';
import { SYSTEM_PROMPT } from '../../packages/core/src/generation/prompts/system.js';
import type { CitedAnswer, LlmClient } from '../../packages/core/src/ports/llm.js';
import type { ScoredChunk, VectorStore } from '../../packages/core/src/ports/vector-store.js';
import { matchRejectionQuery } from '../../packages/core/src/routes/rejection-lookup.js';

const chunk = (id: string, text: string, extra: Partial<Chunk> = {}): Chunk => ({
  id, documentId: 'moc', text, section: '5 WS', page: 3, kind: 'prose', metadata: {}, ...extra,
});

const rows = [chunk('r539', '539 | Rejeição: Duplicidade de NF-e, com diferença na Chave de Acesso', { kind: 'table-row', metadata: { rejectionCode: '539' } })];
const hits: ScoredChunk[] = [{ chunk: chunk('p1', 'O cancelamento deve ocorrer em até 24 horas.'), score: 0.9 }];

function deps(llmAnswer: CitedAnswer, vec: ScoredChunk[] = hits) {
  const store: VectorStore = {
    getDocument: async () => null,
    replaceDocument: async () => {},
    vectorSearch: async () => vec,
    textSearch: async () => [],
    findByRejectionCode: vi.fn(async (code: string) => (code === '539' ? rows : [])),
  };
  const llm: LlmClient = { answer: vi.fn(async () => llmAnswer) };
  return { store, llm, embedder: { dimensions: 1, embed: async (t: string[]) => t.map(() => [1]) } };
}

describe('matchRejectionQuery', () => {
  it.each([['539', '539'], ['rejeição 539', '539'], ['Rejeicao: 539?', '539'], ['cStat 204', '204'], ['erro nº 1234', '1234']])(
    '%j → %s', (q, code) => expect(matchRejectionQuery(q)).toBe(code),
  );
  it.each(['o que é a rejeição 539 e como resolver', 'CFOP 5102', '12', 'R$ 539,00'])('ignora %j', (q) => {
    expect(matchRejectionQuery(q)).toBeNull();
  });
});

describe('ask', () => {
  it('rota determinística responde código de rejeição sem LLM', async () => {
    const d = deps({ encontrado: true, resposta: '', citacoes: [] });
    const out = await ask('rejeição 539', d);
    expect(out).toMatchObject({ route: 'rejection-lookup', kind: 'answer', resposta: rows[0]!.text });
    expect(d.llm.answer).not.toHaveBeenCalled();
  });

  it('código desconhecido cai no RAG', async () => {
    const d = deps({ encontrado: false, resposta: 'Não há o código 999.', citacoes: [] });
    const out = await ask('999', d);
    expect(out).toMatchObject({ route: 'rag', kind: 'refusal' });
    expect(d.llm.answer).toHaveBeenCalledOnce();
  });

  it('RAG com citação válida retorna resposta com chunk resolvido', async () => {
    const d = deps({ encontrado: true, resposta: 'Até 24 horas.', citacoes: [{ chunkId: 'p1', trecho: 'em até 24 horas' }] });
    const out = await ask('Qual o prazo de cancelamento?', d);
    expect(out.kind).toBe('answer');
    if (out.kind === 'answer') expect(out.citacoes[0]!.chunk.page).toBe(3);
    const call = vi.mocked(d.llm.answer).mock.calls[0]![0];
    expect(call.system).toBe(SYSTEM_PROMPT);
    expect(call.messages[0]!.content).toContain('<trecho id="p1"');
  });

  it('pergunta fora do escopo gera recusa quando o modelo cita algo inexistente', async () => {
    const d = deps({ encontrado: true, resposta: 'A alíquota de IR é 15%.', citacoes: [{ chunkId: 'p1', trecho: 'alíquota de 15%' }] });
    expect((await ask('Qual a alíquota do imposto de renda?', d)).kind).toBe('refusal');
  });

  it('sem contexto recuperado recusa sem chamar o LLM', async () => {
    const d = deps({ encontrado: true, resposta: '', citacoes: [] }, []);
    const out = await ask('pergunta qualquer', d);
    expect(out).toMatchObject({ kind: 'refusal', motivo: 'sem-contexto' });
    expect(d.llm.answer).not.toHaveBeenCalled();
  });

  it('minScore filtra chunks pouco relevantes', async () => {
    const d = deps({ encontrado: true, resposta: '', citacoes: [] });
    const out = await ask('pergunta', d, { minScore: 2 });
    expect(out).toMatchObject({ kind: 'refusal', motivo: 'sem-contexto' });
  });
});

describe('buildAnswerPrompt', () => {
  it('limita contexto por tokens, mas inclui ao menos um chunk', () => {
    const big = (id: string) => ({ chunk: chunk(id, 'x'.repeat(3500)), score: 1 });
    expect(buildAnswerPrompt('q', [big('a'), big('b')], 1200).included.map((i) => i.chunk.id)).toEqual(['a']);
    expect(buildAnswerPrompt('q', [big('a')], 10).included).toHaveLength(1);
  });
  it('escapa XML do conteúdo', () => {
    const { prompt } = buildAnswerPrompt('a < b?', [{ chunk: chunk('a', '<tag>&'), score: 1 }]);
    expect(prompt).toContain('&lt;tag&gt;&amp;');
    expect(prompt).toContain('a &lt; b?');
  });
});

describe('claude adapter helpers', () => {
  it('extrai resposta parcial de JSON incompleto, inclusive escapes', () => {
    expect(partialResposta('{"resposta": "Até 24')).toBe('Até 24');
    expect(partialResposta('{"resposta":"linha\\nnova \\u00e9 fim","encontrado"')).toBe('linha\nnova é fim');
    expect(partialResposta('{"resposta":"meio \\')).toBe('meio ');
    expect(partialResposta('{"resposta":"x \\u00')).toBe('x ');
    expect(partialResposta('{"encontrado":')).toBe('');
  });
  it('valida entrada da ferramenta', () => {
    expect(parseAnswerInput({ resposta: 'r', encontrado: true, citacoes: [{ chunkId: 'a', trecho: 't' }] }).citacoes).toHaveLength(1);
    expect(() => parseAnswerInput({ resposta: 'r', citacoes: [] })).toThrow();
    expect(() => parseAnswerInput({ resposta: 'r', encontrado: true, citacoes: [{ chunkId: 1 }] })).toThrow();
  });
});
