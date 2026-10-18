import { readFileSync } from 'node:fs';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgVectorStore } from '../../packages/core/src/adapters/pg-vector-store.js';
import { ingestDocument } from '../../packages/core/src/ingest/pipeline.js';
import type { PdfPage } from '../../packages/core/src/ingest/pdf-extract.js';
import { retrieve } from '../../packages/core/src/retrieval/retrieve.js';
import { hashEmbedder } from '../helpers/hash-embedder.js';

// Requer Docker. Na CI roda sempre; localmente, com RUN_INTEGRATION=1.
const enabled = !!process.env.CI || !!process.env.RUN_INTEGRATION;

const TOPICS = [
  'emissão em contingência offline', 'cancelamento de nota fiscal', 'carta de correção eletrônica',
  'inutilização de numeração', 'consulta de status do serviço', 'manifestação do destinatário',
  'cálculo do ICMS substituição tributária', 'grupo de pagamento', 'informações do transporte', 'QR-Code da NFC-e',
];

/** Base sintética com ~200 chunks: 10 seções × prosa + 150 linhas de rejeição. */
function syntheticPages(): PdfPage[] {
  const pages: PdfPage[] = [];
  TOPICS.forEach((topic, i) => {
    const lines = [`${i + 1} ${topic[0]!.toUpperCase()}${topic.slice(1)}`];
    for (let p = 0; p < 4; p++) lines.push(`Parágrafo ${p} sobre ${topic}: regras de validação e prazos aplicáveis à ${topic}.`);
    pages.push({ page: i + 1, lines });
  });
  const rejections = [`${TOPICS.length + 1} Tabela de Códigos de Rejeição`];
  for (let code = 200; code < 350; code++) {
    rejections.push(code === 239
      ? '239 | Rejeição: Cabeçalho - Versão do arquivo XML não suportada'
      : `${code} | Rejeição: Falha genérica número ${code} na validação do campo x${code}`);
  }
  rejections.push('539 | Rejeição: Duplicidade de NF-e, com diferença na Chave de Acesso');
  pages.push({ page: 50, lines: rejections });
  return pages;
}

describe.skipIf(!enabled)('retrieval (Postgres + pgvector)', () => {
  let container: StartedPostgreSqlContainer;
  let store: PgVectorStore;
  const embedder = hashEmbedder();

  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    store = PgVectorStore.fromUrl(container.getConnectionUri());
    await store.pool.query(readFileSync('db/schema.sql', 'utf8'));
    const res = await ingestDocument({ id: 'moc', name: 'MOC', version: '7.0', pages: syntheticPages() }, { store, embedder });
    expect(res.chunks).toBeGreaterThanOrEqual(180);
  }, 120_000);

  afterAll(async () => {
    await store?.close();
    await container?.stop();
  });

  const cases: Array<[string, (text: string) => boolean]> = [
    ['Como emitir em contingência offline?', (t) => t.includes('contingência offline')],
    ['o que significa a rejeição 539 duplicidade', (t) => t.startsWith('539 |')],
    ['versão do XML não suportada', (t) => t.startsWith('239 |')],
    ['prazo para cancelamento da nota', (t) => t.includes('cancelamento de nota fiscal')],
    ['QR-Code NFC-e', (t) => t.includes('QR-Code')],
  ];

  it('atinge recall@5 = 100% nas perguntas sintéticas', async () => {
    let hits = 0;
    for (const [q, match] of cases) {
      const top = await retrieve(q, { store, embedder }, { topK: 5 });
      if (top.some((r) => match(r.chunk.text))) hits++;
    }
    expect(hits / cases.length).toBe(1);
  });

  it('busca textual usa stemming em português', async () => {
    const out = await store.textSearch('cancelamentos', 5);
    expect(out.some((r) => r.chunk.text.includes('cancelamento'))).toBe(true);
  });

  it('encontra chunk por código de rejeição', async () => {
    const [row] = await store.findByRejectionCode('539');
    expect(row).toMatchObject({ kind: 'table-row', page: 50, metadata: { rejectionCode: '539' } });
  });

  it('reingestão idêntica é ignorada', async () => {
    const res = await ingestDocument({ id: 'moc', name: 'MOC', version: '7.0', pages: syntheticPages() }, { store, embedder });
    expect(res.status).toBe('skipped');
  });
});
