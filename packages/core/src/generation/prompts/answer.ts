import type { ScoredChunk } from '../../ports/vector-store.js';

/** Estimativa conservadora para português (~3,5 caracteres por token). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface BuiltContext {
  prompt: string;
  /** Chunks que efetivamente entraram no prompt (os únicos citáveis). */
  included: ScoredChunk[];
}

/** Monta a mensagem do usuário limitando o contexto por tokens, não por número de chunks. */
export function buildAnswerPrompt(question: string, chunks: ScoredChunk[], maxContextTokens = 6000): BuiltContext {
  const included: ScoredChunk[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const sc of chunks) {
    const c = sc.chunk;
    const block = `<trecho id="${c.id}" documento="${escapeXml(c.documentId)}" secao="${escapeXml(c.section)}" pagina="${c.page}">\n${escapeXml(c.text)}\n</trecho>`;
    const cost = estimateTokens(block);
    if (used + cost > maxContextTokens && included.length > 0) break;
    parts.push(block);
    included.push(sc);
    used += cost;
  }
  const prompt = `<contexto>\n${parts.join('\n')}\n</contexto>\n\n<pergunta>\n${escapeXml(question)}\n</pergunta>`;
  return { prompt, included };
}
