import type { LlmClient } from '../ports/llm.js';
import type { ScoredChunk } from '../ports/vector-store.js';
import { retrieve, type RetrieveDeps, type RetrieveOptions } from '../retrieval/retrieve.js';
import { lookupRejection, matchRejectionQuery } from '../routes/rejection-lookup.js';
import { applyGuardrail, REFUSAL_TEXT, type GuardedAnswer } from './guardrail.js';
import { buildAnswerPrompt } from './prompts/answer.js';
import { SYSTEM_PROMPT } from './prompts/system.js';

export interface AskDeps extends RetrieveDeps {
  llm: LlmClient;
}

export interface AskOptions {
  retrieval?: RetrieveOptions;
  maxContextTokens?: number;
  /** Relevância mínima (score do reranker/RRF) para um chunk entrar no contexto. */
  minScore?: number;
  onDelta?: (text: string) => void;
}

export type AskResult = GuardedAnswer & {
  route: 'rejection-lookup' | 'rag';
  /** Chunks enviados ao modelo (ou encontrados na rota determinística). */
  contexto: ScoredChunk[];
};

export async function ask(question: string, deps: AskDeps, opts: AskOptions = {}): Promise<AskResult> {
  const code = matchRejectionQuery(question);
  if (code) {
    const { chunks } = await lookupRejection(code, deps);
    const contexto = chunks.map((chunk) => ({ chunk, score: 1 }));
    const [row] = chunks;
    if (row) {
      return {
        route: 'rejection-lookup',
        kind: 'answer',
        resposta: row.text,
        citacoes: chunks.slice(0, 3).map((chunk) => ({ chunk, trecho: chunk.text })),
        descartadas: 0,
        contexto,
      };
    }
    // Código não indexado: cai para o RAG, que pode achar menções em prosa ou recusar.
  }

  const retrieved = (await retrieve(question, deps, opts.retrieval)).filter((r) => r.score >= (opts.minScore ?? -Infinity));
  if (retrieved.length === 0) {
    return { route: 'rag', kind: 'refusal', motivo: 'sem-contexto', resposta: REFUSAL_TEXT, contexto: [] };
  }
  const { prompt, included } = buildAnswerPrompt(question, retrieved, opts.maxContextTokens);
  const raw = await deps.llm.answer({ system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }], onDelta: opts.onDelta });
  return { route: 'rag', ...applyGuardrail(raw, included.map((i) => i.chunk)), contexto: included };
}
