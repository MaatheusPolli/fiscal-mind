import type { Chunk } from '../domain/chunk.js';
import type { AskResult } from '../generation/answer.js';

export interface EvalCase {
  id: string;
  pergunta: string;
  /** Substrings que algum chunk relevante deve conter (qualquer uma basta para cada fonte). */
  fontes: string[];
  /** Termos que a resposta correta deve mencionar. */
  respostaEsperada?: string[];
  /** Pergunta fora do escopo: o sistema deve recusar. */
  foraDoEscopo?: boolean;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');

export const chunkMatches = (chunk: Chunk, fonte: string) => norm(chunk.text).includes(norm(fonte));

/** Fração das fontes esperadas encontradas entre os k primeiros chunks. */
export function recallAtK(retrieved: Chunk[], fontes: string[], k: number): number {
  if (fontes.length === 0) return 1;
  const top = retrieved.slice(0, k);
  return fontes.filter((f) => top.some((c) => chunkMatches(c, f))).length / fontes.length;
}

/** Resposta fundamentada: tem citação válida e nenhuma citação foi descartada pelo guardrail. */
export function isGrounded(result: AskResult): boolean {
  return result.kind === 'answer' && result.citacoes.length > 0 && result.descartadas === 0;
}

/** Correção por termos-chave: todos os termos esperados aparecem na resposta. */
export function isCorrect(result: AskResult, expected: string[] = []): boolean {
  if (result.kind !== 'answer') return false;
  const text = norm(result.resposta);
  return expected.every((t) => text.includes(norm(t)));
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
