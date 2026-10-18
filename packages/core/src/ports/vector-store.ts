import type { Chunk } from '../domain/chunk.js';

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

export interface DocumentRecord {
  id: string;
  name: string;
  version: string;
  sourceUrl?: string;
  contentHash: string;
}

export interface VectorStore {
  getDocument(id: string): Promise<DocumentRecord | null>;
  /** Substitui atomicamente o documento e todos os seus chunks. */
  replaceDocument(doc: DocumentRecord, chunks: Array<{ chunk: Chunk; embedding: number[] }>): Promise<void>;
  vectorSearch(embedding: number[], k: number): Promise<ScoredChunk[]>;
  textSearch(query: string, k: number): Promise<ScoredChunk[]>;
  findByRejectionCode(code: string): Promise<Chunk[]>;
}
