import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from '../ports/embedding.js';
import type { DocumentRecord, VectorStore } from '../ports/vector-store.js';
import { chunkDocument, type ChunkerOptions } from './chunker.js';
import type { PdfPage } from './pdf-extract.js';

export interface IngestInput {
  id: string;
  name: string;
  version: string;
  sourceUrl?: string;
  pages: PdfPage[];
}

export interface IngestResult {
  documentId: string;
  status: 'skipped' | 'indexed';
  chunks: number;
}

export function contentHash(input: Pick<IngestInput, 'version' | 'pages'>): string {
  const h = createHash('sha256').update(input.version);
  for (const p of input.pages) h.update(`\f${p.page}\n${p.lines.join('\n')}`);
  return h.digest('hex');
}

/** Idempotente: reindexa apenas se o conteúdo (ou a versão) mudou. */
export async function ingestDocument(
  input: IngestInput,
  deps: { store: VectorStore; embedder: EmbeddingProvider; batchSize?: number; chunker?: ChunkerOptions; force?: boolean },
): Promise<IngestResult> {
  const hash = contentHash(input);
  const existing = await deps.store.getDocument(input.id);
  if (!deps.force && existing?.contentHash === hash) return { documentId: input.id, status: 'skipped', chunks: 0 };

  const chunks = chunkDocument(input.id, input.pages, deps.chunker);
  const batch = deps.batchSize ?? 64;
  const embeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += batch) {
    const slice = chunks.slice(i, i + batch).map((c) => `${c.section}\n${c.text}`);
    embeddings.push(...(await deps.embedder.embed(slice, 'document')));
  }
  if (embeddings.length !== chunks.length) throw new Error('Embedder retornou quantidade inesperada de vetores');

  const doc: DocumentRecord = { id: input.id, name: input.name, version: input.version, sourceUrl: input.sourceUrl, contentHash: hash };
  await deps.store.replaceDocument(doc, chunks.map((chunk, i) => ({ chunk, embedding: embeddings[i]! })));
  return { documentId: input.id, status: 'indexed', chunks: chunks.length };
}
