import { describe, expect, it, vi } from 'vitest';
import type { Chunk } from '../../packages/core/src/domain/chunk.js';
import { ingestDocument, type IngestInput } from '../../packages/core/src/ingest/pipeline.js';
import type { EmbeddingProvider } from '../../packages/core/src/ports/embedding.js';
import type { DocumentRecord, VectorStore } from '../../packages/core/src/ports/vector-store.js';

class MemoryStore implements VectorStore {
  docs = new Map<string, DocumentRecord>();
  chunks = new Map<string, Chunk>();
  async getDocument(id: string) {
    return this.docs.get(id) ?? null;
  }
  async replaceDocument(doc: DocumentRecord, items: Array<{ chunk: Chunk }>) {
    for (const [id, c] of this.chunks) if (c.documentId === doc.id) this.chunks.delete(id);
    this.docs.set(doc.id, doc);
    for (const { chunk } of items) this.chunks.set(chunk.id, chunk);
  }
  async vectorSearch() { return []; }
  async textSearch() { return []; }
  async findByRejectionCode() { return []; }
}

const embedder: EmbeddingProvider = {
  dimensions: 2,
  embed: vi.fn(async (texts: string[]) => texts.map(() => [0, 1])),
};

const input = (lines: string[], version = '7.0'): IngestInput => ({
  id: 'moc', name: 'MOC', version, pages: [{ page: 1, lines }],
});

describe('ingestDocument', () => {
  it('indexa, pula reingestão idêntica e reindexa ao mudar', async () => {
    const store = new MemoryStore();
    const lines = ['1 Introdução', 'Texto.', '539 | Rejeição: Duplicidade'];

    const first = await ingestDocument(input(lines), { store, embedder, batchSize: 2 });
    expect(first).toEqual({ documentId: 'moc', status: 'indexed', chunks: 3 });
    expect(store.chunks.size).toBe(3);

    expect((await ingestDocument(input(lines), { store, embedder })).status).toBe('skipped');

    const changed = await ingestDocument(input(['1 Introdução', 'Texto novo.']), { store, embedder });
    expect(changed.status).toBe('indexed');
    expect(store.chunks.size).toBe(2);

    expect((await ingestDocument(input(['1 Introdução', 'Texto novo.'], '7.1'), { store, embedder })).status).toBe('indexed');
  });

  it('falha se o embedder devolver quantidade errada', async () => {
    const bad: EmbeddingProvider = { dimensions: 2, embed: async () => [] };
    await expect(ingestDocument(input(['Texto.']), { store: new MemoryStore(), embedder: bad })).rejects.toThrow();
  });
});
