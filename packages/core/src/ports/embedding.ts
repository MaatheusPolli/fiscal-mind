export interface EmbeddingProvider {
  readonly dimensions: number;
  embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]>;
}
