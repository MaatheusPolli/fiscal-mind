import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ClaudeLlm } from '../../../packages/core/src/adapters/claude-llm.js';
import { hashEmbedder } from '../../../packages/core/src/adapters/hash-embedder.js';
import { MemoryVectorStore } from '../../../packages/core/src/adapters/memory-store.js';
import { PgVectorStore } from '../../../packages/core/src/adapters/pg-vector-store.js';
import { voyageEmbeddings, voyageReranker } from '../../../packages/core/src/adapters/voyage.js';
import { ingestDocument, type IngestInput } from '../../../packages/core/src/ingest/pipeline.js';
import { buildServer, type ServerDeps } from './server.js';

const root = resolve(import.meta.dirname, '../../..');
const { DATABASE_URL, VOYAGE_API_KEY, ANTHROPIC_API_KEY, PORT = '3000' } = process.env;

async function buildDeps(): Promise<ServerDeps> {
  const llm = ANTHROPIC_API_KEY ? new ClaudeLlm() : undefined;
  const pdfUrl = (id: string) => (existsSync(resolve(root, 'data/sources', `${id}.pdf`)) ? `/api/documents/${id}.pdf` : undefined);
  if (DATABASE_URL && VOYAGE_API_KEY) {
    return {
      mode: 'postgres',
      store: PgVectorStore.fromUrl(DATABASE_URL),
      embedder: voyageEmbeddings(VOYAGE_API_KEY),
      reranker: voyageReranker(VOYAGE_API_KEY),
      llm,
      pdfUrl,
    };
  }
  // Modo demonstração: corpus sintético em memória, sem banco nem API de embeddings.
  const store = new MemoryVectorStore();
  const embedder = hashEmbedder();
  const corpus = JSON.parse(readFileSync(resolve(root, 'tests/fixtures/corpus-sintetico.json'), 'utf8')) as IngestInput;
  await ingestDocument(corpus, { store, embedder });
  return { mode: 'demo (corpus sintético)', store, embedder, llm, pdfUrl };
}

const app = buildServer(await buildDeps());

app.get<{ Params: { id: string } }>('/api/documents/:id.pdf', async (req, reply) => {
  const id = req.params.id;
  const path = resolve(root, 'data/sources', `${id}.pdf`);
  if (!/^[\w-]+$/.test(id) || !existsSync(path)) return reply.code(404).send({ message: 'Documento não encontrado' });
  return reply.type('application/pdf').send(readFileSync(path));
});

await app.listen({ port: Number(PORT), host: '127.0.0.1' });
