import type { EmbeddingProvider } from '../ports/embedding.js';
import type { Reranker } from '../ports/reranker.js';
import { scoringReranker } from '../retrieval/rerank.js';

const BASE_URL = 'https://api.voyageai.com/v1';

async function post<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Voyage ${path} falhou: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function voyageEmbeddings(apiKey: string, model = 'voyage-3'): EmbeddingProvider {
  return {
    dimensions: 1024,
    async embed(texts, inputType) {
      const out = await post<{ data: Array<{ embedding: number[]; index: number }> }>(apiKey, '/embeddings', {
        input: texts,
        model,
        input_type: inputType,
      });
      return out.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    },
  };
}

export function voyageReranker(apiKey: string, model = 'rerank-2'): Reranker {
  return scoringReranker(async (query, documents) => {
    const out = await post<{ data: Array<{ index: number; relevance_score: number }> }>(apiKey, '/rerank', {
      query,
      documents,
      model,
    });
    const scores = new Array<number>(documents.length).fill(0);
    for (const d of out.data) scores[d.index] = d.relevance_score;
    return scores;
  });
}
