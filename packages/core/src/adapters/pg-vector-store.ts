import pg from 'pg';
import type { Chunk } from '../domain/chunk.js';
import type { DocumentRecord, ScoredChunk, VectorStore } from '../ports/vector-store.js';

interface ChunkRow {
  id: string;
  document_id: string;
  text: string;
  section: string;
  page: number;
  kind: Chunk['kind'];
  metadata: Chunk['metadata'];
  score?: number;
}

/** Formato textual aceito pelo pgvector: '[0.1,0.2,...]'. */
const toVectorLiteral = (v: number[]) => `[${v.join(',')}]`;

const COLUMNS = 'id, document_id, text, section, page, kind, metadata';

function toChunk(r: ChunkRow): Chunk {
  return { id: r.id, documentId: r.document_id, text: r.text, section: r.section, page: r.page, kind: r.kind, metadata: r.metadata };
}

export class PgVectorStore implements VectorStore {
  constructor(readonly pool: pg.Pool) {}

  static fromUrl(url: string): PgVectorStore {
    return new PgVectorStore(new pg.Pool({ connectionString: url }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getDocument(id: string): Promise<DocumentRecord | null> {
    const { rows } = await this.pool.query(
      'SELECT id, name, version, source_url, content_hash FROM documents WHERE id = $1',
      [id],
    );
    const r = rows[0];
    return r ? { id: r.id, name: r.name, version: r.version, sourceUrl: r.source_url ?? undefined, contentHash: r.content_hash } : null;
  }

  async replaceDocument(doc: DocumentRecord, chunks: Array<{ chunk: Chunk; embedding: number[] }>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM documents WHERE id = $1', [doc.id]);
      await client.query(
        'INSERT INTO documents (id, name, version, source_url, content_hash) VALUES ($1, $2, $3, $4, $5)',
        [doc.id, doc.name, doc.version, doc.sourceUrl ?? null, doc.contentHash],
      );
      for (const { chunk: c, embedding } of chunks) {
        await client.query(
          `INSERT INTO chunks (${COLUMNS}, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [c.id, c.documentId, c.text, c.section, c.page, c.kind, c.metadata, toVectorLiteral(embedding)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async vectorSearch(embedding: number[], k: number): Promise<ScoredChunk[]> {
    const { rows } = await this.pool.query<ChunkRow>(
      `SELECT ${COLUMNS}, 1 - (embedding <=> $1::vector) AS score
         FROM chunks WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector LIMIT $2`,
      [toVectorLiteral(embedding), k],
    );
    return rows.map((r) => ({ chunk: toChunk(r), score: Number(r.score) }));
  }

  async textSearch(query: string, k: number): Promise<ScoredChunk[]> {
    // Lexemas já stemmizados pelo 'portuguese'; 'simple' evita stemmizar de novo.
    // OR entre termos: perguntas em linguagem natural raramente têm todos os termos no mesmo trecho.
    const { rows } = await this.pool.query<ChunkRow>(
      `WITH q AS (
         SELECT to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) AS tsq
           FROM unnest(to_tsvector('portuguese', $1)) AS t(lexeme)
       )
       SELECT ${COLUMNS}, ts_rank_cd(tsv, q.tsq) AS score
         FROM chunks, q
        WHERE q.tsq IS NOT NULL AND tsv @@ q.tsq
        ORDER BY score DESC, id LIMIT $2`,
      [query, k],
    );
    return rows.map((r) => ({ chunk: toChunk(r), score: Number(r.score) }));
  }

  async findByRejectionCode(code: string): Promise<Chunk[]> {
    const { rows } = await this.pool.query<ChunkRow>(
      `SELECT ${COLUMNS} FROM chunks WHERE metadata->>'rejectionCode' = $1
        ORDER BY (kind = 'table-row') DESC, document_id, page`,
      [code],
    );
    return rows.map(toChunk);
  }
}
