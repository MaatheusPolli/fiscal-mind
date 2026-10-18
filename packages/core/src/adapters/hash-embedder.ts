import type { EmbeddingProvider } from '../ports/embedding.js';

/**
 * Embedder determinístico para testes: bag-of-words com hashing em 1024 dimensões, normalizado.
 * Não captura semântica, mas aproxima textos com vocabulário em comum — suficiente para testar o encanamento.
 */
export function hashEmbedder(dimensions = 1024): EmbeddingProvider {
  const embedOne = (text: string) => {
    const v = new Array<number>(dimensions).fill(0);
    const tokens = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[a-z0-9]+/g) ?? [];
    for (const t of tokens) {
      let h = 2166136261;
      for (const ch of t) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      v[(h >>> 0) % dimensions]! += 1;
    }
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  };
  return { dimensions, embed: async (texts) => texts.map(embedOne) };
}
