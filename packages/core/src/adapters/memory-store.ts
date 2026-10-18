import type { Chunk } from '../domain/chunk.js';
import type { DocumentRecord, ScoredChunk, VectorStore } from '../ports/vector-store.js';

const STOPWORDS = new Set(
  'a o e de da do das dos em no na nos nas um uma para por com que se os as ao aos à às ou é qual quais como quando onde'.split(' '),
);

/** Tokenização simples para BM25: minúsculas, sem acentos, sem stopwords, sufixo plural removido. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]+/g) ?? [])
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

interface Entry {
  chunk: Chunk;
  embedding: number[];
  tf: Map<string, number>;
  len: number;
}

/** VectorStore em memória com cosseno e BM25 — para avaliação offline e testes, sem Postgres. */
export class MemoryVectorStore implements VectorStore {
  private docs = new Map<string, DocumentRecord>();
  private entries: Entry[] = [];

  async getDocument(id: string) {
    return this.docs.get(id) ?? null;
  }

  async replaceDocument(doc: DocumentRecord, chunks: Array<{ chunk: Chunk; embedding: number[] }>) {
    this.entries = this.entries.filter((e) => e.chunk.documentId !== doc.id);
    this.docs.set(doc.id, doc);
    for (const { chunk, embedding } of chunks) {
      const tokens = tokenize(`${chunk.section} ${chunk.text}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      this.entries.push({ chunk, embedding, tf, len: tokens.length });
    }
  }

  async vectorSearch(embedding: number[], k: number): Promise<ScoredChunk[]> {
    const norm = (v: number[]) => Math.hypot(...v) || 1;
    const qn = norm(embedding);
    return this.entries
      .map((e) => ({ chunk: e.chunk, score: e.embedding.reduce((s, x, i) => s + x * (embedding[i] ?? 0), 0) / (qn * norm(e.embedding)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  async textSearch(query: string, k: number, k1 = 1.2, b = 0.75): Promise<ScoredChunk[]> {
    const terms = [...new Set(tokenize(query))];
    const n = this.entries.length;
    if (!terms.length || !n) return [];
    const avg = this.entries.reduce((s, e) => s + e.len, 0) / n;
    const idf = new Map(terms.map((t) => {
      const df = this.entries.filter((e) => e.tf.has(t)).length;
      return [t, Math.log(1 + (n - df + 0.5) / (df + 0.5))];
    }));
    return this.entries
      .map((e) => {
        let score = 0;
        for (const t of terms) {
          const f = e.tf.get(t) ?? 0;
          if (f) score += idf.get(t)! * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * e.len) / avg)));
        }
        return { chunk: e.chunk, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, k);
  }

  async findByRejectionCode(code: string): Promise<Chunk[]> {
    return this.entries
      .map((e) => e.chunk)
      .filter((c) => c.metadata.rejectionCode === code)
      .sort((a, b) => Number(b.kind === 'table-row') - Number(a.kind === 'table-row') || a.page - b.page);
  }
}
