/**
 * Reindexa documentos de data/sources.json (RF10).
 * Sem argumentos: reindexa só os que mudaram (mesmo comportamento de `pnpm ingest`).
 * Com ids: força a reindexação dos documentos informados, mesmo sem mudança de conteúdo.
 * Uso: pnpm reindex [id ...]   (requer DATABASE_URL e VOYAGE_API_KEY)
 */
import { existsSync, readFileSync } from 'node:fs';
import { PgVectorStore } from '../packages/core/src/adapters/pg-vector-store.js';
import { voyageEmbeddings } from '../packages/core/src/adapters/voyage.js';
import { extractPdf } from '../packages/core/src/ingest/pdf-extract.js';
import { ingestDocument } from '../packages/core/src/ingest/pipeline.js';

interface Source {
  id: string;
  name: string;
  version: string;
  url?: string;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não definida`);
  return v;
}

const requested = process.argv.slice(2);
const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')) as Source[];
const unknown = requested.filter((id) => !sources.some((s) => s.id === id));
if (unknown.length > 0) throw new Error(`Documento(s) não registrado(s) em sources.json: ${unknown.join(', ')}`);

const store = PgVectorStore.fromUrl(env('DATABASE_URL'));
const embedder = voyageEmbeddings(env('VOYAGE_API_KEY'));

try {
  for (const src of sources) {
    const path = `data/sources/${src.id}.pdf`;
    if (!existsSync(path)) {
      console.warn(`- ${src.id}: ${path} ausente (baixe de ${src.url ?? 'URL não registrada'})`);
      continue;
    }
    const force = requested.includes(src.id);
    const pages = await extractPdf(new Uint8Array(readFileSync(path)));
    const res = await ingestDocument({ id: src.id, name: src.name, version: src.version, sourceUrl: src.url, pages }, { store, embedder, force });
    console.log(`- ${src.id}: ${res.status}${res.status === 'indexed' ? ` (${res.chunks} chunks, ${pages.length} páginas)` : ''}`);
  }
} finally {
  await store.close();
}
