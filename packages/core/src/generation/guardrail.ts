import type { Chunk } from '../domain/chunk.js';
import type { CitedAnswer } from '../ports/llm.js';

export interface ResolvedCitation {
  chunk: Chunk;
  trecho: string;
}

export type GuardedAnswer =
  | { kind: 'answer'; resposta: string; citacoes: ResolvedCitation[]; descartadas: number }
  | { kind: 'refusal'; motivo: 'modelo-nao-encontrou' | 'sem-citacao-valida' | 'sem-contexto'; resposta: string };

export const REFUSAL_TEXT =
  'Não encontrei na documentação indexada um trecho que sustente essa resposta. Tente reformular a pergunta ou consulte o manual diretamente.';

const normalize = (s: string) =>
  s.normalize('NFC').toLowerCase().replace(/[“”"«»]/g, '"').replace(/\s+/g, ' ').trim();

/**
 * Valida as citações contra o contexto enviado ao modelo:
 * - chunkId precisa estar no contexto;
 * - o trecho precisa aparecer literalmente (normalizando espaços/caixa) no chunk.
 * Sem nenhuma citação válida, a resposta vira recusa.
 */
export function applyGuardrail(answer: CitedAnswer, context: Chunk[]): GuardedAnswer {
  if (!answer.encontrado) {
    return { kind: 'refusal', motivo: 'modelo-nao-encontrou', resposta: answer.resposta.trim() || REFUSAL_TEXT };
  }
  const byId = new Map(context.map((c) => [c.id, c]));
  const valid: ResolvedCitation[] = [];
  const seen = new Set<string>();
  for (const cit of answer.citacoes) {
    const chunk = byId.get(cit.chunkId);
    const trecho = cit.trecho.trim();
    if (!chunk || !trecho || !normalize(chunk.text).includes(normalize(trecho))) continue;
    const key = `${chunk.id}\u0000${normalize(trecho)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push({ chunk, trecho });
  }
  if (valid.length === 0) return { kind: 'refusal', motivo: 'sem-citacao-valida', resposta: REFUSAL_TEXT };
  return { kind: 'answer', resposta: answer.resposta, citacoes: valid, descartadas: answer.citacoes.length - valid.length };
}
