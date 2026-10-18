/**
 * Ingere os PDFs listados em data/sources.json que existirem em data/sources/<id>.pdf.
 * Uso: pnpm ingest   (requer DATABASE_URL e VOYAGE_API_KEY)
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

const sources = JSON.parse(readFileSync('data/sources.json', 'utf8')) as Source[];
const store = PgVectorStore.fromUrl(env('DATABASE_URL'));
const embedder = voyageEmbeddings(env('VOYAGE_API_KEY'));

try {
  for (const src of sources) {
    const path = `data/sources/${src.id}.pdf`;
    if (!existsSync(path)) {
      console.warn(`- ${src.id}: ${path} ausente (baixe de ${src.url ?? 'URL não registrada'})`);
      continue;
    }
    const pages = await extractPdf(new Uint8Array(readFileSync(path)));
    const res = await ingestDocument({ id: src.id, name: src.name, version: src.version, sourceUrl: src.url, pages }, { store, embedder });
    console.log(`- ${src.id}: ${res.status}${res.status === 'indexed' ? ` (${res.chunks} chunks, ${pages.length} páginas)` : ''}`);
  }
} finally {
  await store.close();
}
