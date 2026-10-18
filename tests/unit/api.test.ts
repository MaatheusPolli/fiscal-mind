import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildServer, type ServerDeps } from '../../apps/api/src/server.js';
import { hashEmbedder } from '../../packages/core/src/adapters/hash-embedder.js';
import { MemoryVectorStore } from '../../packages/core/src/adapters/memory-store.js';
import { ingestDocument, type IngestInput } from '../../packages/core/src/ingest/pipeline.js';
import type { LlmClient } from '../../packages/core/src/ports/llm.js';

function parseSse(body: string) {
  return body.split('\n\n').filter(Boolean).map((raw) => ({
    event: /^event: (.+)$/m.exec(raw)![1]!,
    data: JSON.parse(/^data: (.+)$/m.exec(raw)![1]!),
  }));
}

let base: Omit<ServerDeps, 'llm'>;
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const store = new MemoryVectorStore();
  const embedder = hashEmbedder();
  await ingestDocument(JSON.parse(readFileSync('tests/fixtures/corpus-sintetico.json', 'utf8')) as IngestInput, { store, embedder });
  base = { store, embedder, mode: 'test', pdfUrl: (id) => `/api/documents/${id}.pdf` };
});

describe('API', () => {
  it('health informa modo e LLM', async () => {
    const res = await buildServer(base).inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok', mode: 'test', llm: false });
  });

  it('search devolve fontes com link para a página do PDF', async () => {
    const res = await buildServer(base).inject({ method: 'POST', url: '/api/search', payload: { q: 'prazo de cancelamento' } });
    const [first] = res.json().results;
    expect(first.text).toContain('cancelamento');
    expect(first.pdfUrl).toBe(`/api/documents/moc-sintetico.pdf#page=${first.page}`);
  });

  it('valida o corpo', async () => {
    const res = await buildServer(base).inject({ method: 'POST', url: '/api/chat', payload: { pergunta: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('chat responde código de rejeição sem LLM, via SSE', async () => {
    const res = await buildServer(base).inject({ method: 'POST', url: '/api/chat', payload: { pergunta: '539' } });
    expect(res.headers['content-type']).toContain('text/event-stream');
    const [done] = parseSse(res.body);
    expect(done).toMatchObject({ event: 'done', data: { kind: 'answer', route: 'rejection-lookup' } });
    expect(done!.data.fontes[0].text).toContain('539 | Rejeição');
  });

  it('chat faz streaming de deltas e resolve citações', async () => {
    const llm: LlmClient = {
      async answer({ messages, onDelta }) {
        const m = /<trecho id="([^"]+)"[^>]*>\n([^\n]+)/.exec(messages[0]!.content)!;
        onDelta?.('Resposta ');
        onDelta?.('parcial');
        return { encontrado: true, resposta: 'Resposta parcial', citacoes: [{ chunkId: m[1]!, trecho: m[2]!.slice(0, 15) }] };
      },
    };
    const res = await buildServer({ ...base, llm }).inject({ method: 'POST', url: '/api/chat', payload: { pergunta: 'prazo para cancelar' } });
    const events = parseSse(res.body);
    expect(events.filter((e) => e.event === 'delta').map((e) => e.data.text).join('')).toBe('Resposta parcial');
    const done = events.at(-1)!;
    expect(done.data.kind).toBe('answer');
    expect(done.data.fontes.map((f: { chunkId: string }) => f.chunkId)).toContain(done.data.citacoes[0].chunkId);
  });

  it('sem LLM, pergunta aberta vira recusa explicada', async () => {
    const res = await buildServer(base).inject({ method: 'POST', url: '/api/chat', payload: { pergunta: 'prazo para cancelar' } });
    expect(parseSse(res.body)[0]!.data).toMatchObject({ kind: 'refusal', motivo: 'modelo-nao-encontrou' });
  });

  it('erro do LLM vira evento error', async () => {
    const llm: LlmClient = { answer: async () => { throw new Error('boom'); } };
    const res = await buildServer({ ...base, llm }).inject({ method: 'POST', url: '/api/chat', payload: { pergunta: 'prazo para cancelar' } });
    expect(parseSse(res.body)[0]!.event).toBe('error');
  });
});
