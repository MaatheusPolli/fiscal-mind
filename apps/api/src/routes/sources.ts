import type { Chunk } from '../../../../packages/core/src/domain/chunk.js';
import type { ServerDeps } from '../server.js';

export interface SourceDto {
  chunkId: string;
  documentId: string;
  section: string;
  page: number;
  kind: Chunk['kind'];
  text: string;
  /** Link direto para a página no PDF, quando o documento estiver disponível. */
  pdfUrl?: string;
}

export function toSource(chunk: Chunk, deps: Pick<ServerDeps, 'pdfUrl'>): SourceDto {
  const base = deps.pdfUrl?.(chunk.documentId);
  return {
    chunkId: chunk.id,
    documentId: chunk.documentId,
    section: chunk.section,
    page: chunk.page,
    kind: chunk.kind,
    text: chunk.text,
    pdfUrl: base ? `${base}#page=${chunk.page}` : undefined,
  };
}
