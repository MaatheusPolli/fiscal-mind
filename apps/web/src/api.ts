export interface Source {
  chunkId: string;
  documentId: string;
  section: string;
  page: number;
  kind: 'prose' | 'table-row' | 'heading';
  text: string;
  pdfUrl?: string;
}

export interface Citation {
  chunkId: string;
  trecho: string;
}

export interface ChatResult {
  kind: 'answer' | 'refusal';
  route: 'rejection-lookup' | 'rag';
  resposta: string;
  motivo?: string;
  citacoes: Citation[];
  fontes: Source[];
}

/** POST com resposta SSE (EventSource só suporta GET). */
export async function streamChat(
  pergunta: string,
  handlers: { onDelta: (text: string) => void; signal?: AbortSignal },
): Promise<ChatResult> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pergunta }),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Erro ${res.status}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const event = /^event: (.+)$/m.exec(raw)?.[1];
      const data = /^data: (.+)$/m.exec(raw)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === 'delta') handlers.onDelta(payload.text);
      else if (event === 'done') return payload as ChatResult;
      else if (event === 'error') throw new Error(payload.message);
    }
  }
  throw new Error('Conexão encerrada sem resposta');
}
