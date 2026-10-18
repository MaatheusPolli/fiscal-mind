export interface Citation {
  chunkId: string;
  trecho: string;
}

export interface CitedAnswer {
  /** false quando o modelo declara que o contexto não sustenta uma resposta. */
  encontrado: boolean;
  resposta: string;
  citacoes: Citation[];
}

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmClient {
  /** Gera resposta estruturada (tool use); onDelta recebe o texto da resposta em streaming. */
  answer(params: {
    system: string;
    messages: LlmMessage[];
    onDelta?: (text: string) => void;
  }): Promise<CitedAnswer>;
}
