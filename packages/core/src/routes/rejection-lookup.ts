import type { Chunk } from '../domain/chunk.js';
import type { VectorStore } from '../ports/vector-store.js';

/** "539", "rejeição 539", "Rejeicao: 539", "cStat 539", "erro 539?" */
const PATTERN = /^\s*(?:(?:rejei[çc][ãa]o|cstat|erro|c[óo]digo)\s*(?:n[º°o.]\s*)?[:=]?\s*)?(\d{3,4})\s*[?.!]?\s*$/i;

export function matchRejectionQuery(query: string): string | null {
  return PATTERN.exec(query)?.[1] ?? null;
}

export interface RejectionLookupResult {
  code: string;
  /** Linha(s) da tabela primeiro, depois menções em prosa. */
  chunks: Chunk[];
}

/** Rota determinística: sem LLM, direto no índice de metadados. */
export async function lookupRejection(code: string, deps: { store: VectorStore }): Promise<RejectionLookupResult> {
  return { code, chunks: await deps.store.findByRejectionCode(code) };
}
