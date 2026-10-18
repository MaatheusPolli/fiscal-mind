import { createHash } from 'node:crypto';

export type ChunkKind = 'prose' | 'table-row' | 'heading';

export interface ChunkMetadata {
  rejectionCode?: string;
  cst?: string;
  cfop?: string;
}

export interface Chunk {
  id: string;
  documentId: string;
  text: string;
  section: string;
  page: number;
  kind: ChunkKind;
  metadata: ChunkMetadata;
}

/** Identidade estável: permite reingestão idempotente. */
export function chunkId(documentId: string, section: string, index: number): string {
  return createHash('sha256').update(`${documentId}\u0000${section}\u0000${index}`).digest('hex').slice(0, 32);
}
