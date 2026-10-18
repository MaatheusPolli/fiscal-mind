import { chunkId, type Chunk } from '../domain/chunk.js';
import { extractMetadata, isRejectionRow } from './metadata.js';
import type { PdfPage } from './pdf-extract.js';

export interface ChunkerOptions {
  maxChars?: number;
  overlapChars?: number;
}

/** "5.1.2 Validação do Schema" — número hierárquico seguido de título com inicial maiúscula. */
const HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,4})\.?\s+([A-ZÀ-Ú][^|]{2,120})$/;

interface ProseBuffer {
  text: string;
  page: number;
}

export function chunkDocument(documentId: string, pages: PdfPage[], opts: ChunkerOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 1200;
  const overlap = opts.overlapChars ?? 200;
  const chunks: Chunk[] = [];
  const counters = new Map<string, number>();
  const stack: string[] = [];
  let section = 'Preâmbulo';
  let buf: ProseBuffer | null = null;

  const push = (text: string, page: number, kind: Chunk['kind']) => {
    const index = counters.get(section) ?? 0;
    counters.set(section, index + 1);
    chunks.push({ id: chunkId(documentId, section, index), documentId, text, section, page, kind, metadata: extractMetadata(text) });
  };

  const flush = () => {
    if (buf && buf.text.trim()) push(buf.text.trim(), buf.page, 'prose');
    buf = null;
  };

  const appendProse = (line: string, page: number) => {
    if (!buf) buf = { text: '', page };
    const candidate = buf.text ? `${buf.text} ${line}` : line;
    if (candidate.length <= maxChars || !buf.text) {
      buf.text = candidate;
      return;
    }
    const prev = buf.text;
    push(prev, buf.page, 'prose');
    const tail = prev.slice(Math.max(0, prev.length - overlap));
    const cut = tail.indexOf(' ');
    buf = { text: `${cut >= 0 ? tail.slice(cut + 1) : tail} ${line}`, page };
  };

  for (const { page, lines } of pages) {
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const heading = HEADING.exec(line);
      if (heading) {
        flush();
        const number = heading[1]!;
        const depth = number.split('.').length;
        stack.length = depth - 1;
        stack[depth - 1] = `${number} ${heading[2]!.trim()}`;
        section = stack.filter(Boolean).join(' > ');
        push(line, page, 'heading');
        continue;
      }
      if (isRejectionRow(line)) {
        flush();
        push(line, page, 'table-row');
        continue;
      }
      appendProse(line, page);
    }
  }
  flush();
  return chunks;
}
