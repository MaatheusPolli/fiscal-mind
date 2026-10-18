import { describe, expect, it } from 'vitest';
import { chunkDocument } from '../../packages/core/src/ingest/chunker.js';
import type { PdfPage } from '../../packages/core/src/ingest/pdf-extract.js';

const pages: PdfPage[] = [
  {
    page: 10,
    lines: [
      'Texto introdutório antes de qualquer seção.',
      '5 Web Services',
      'Os Web Services da SEFAZ recebem as mensagens do contribuinte.',
      '5.1 Autorização',
      'O serviço de autorização valida o lote.',
      '5.1.1 Validação do Schema',
      'A mensagem é validada contra o schema XML.',
    ],
  },
  {
    page: 11,
    lines: [
      '5.2 Tabela de Códigos de Rejeição',
      'Código | Descrição',
      '204 | Rejeição: Duplicidade de NF-e',
      '539 | Rejeição: Duplicidade de NF-e, com diferença na Chave de Acesso',
      '6 Contingência',
      'Modalidades de contingência.',
    ],
  },
];

describe('chunkDocument', () => {
  const chunks = chunkDocument('moc', pages);

  it('atribui seção hierárquica correta', () => {
    const schema = chunks.find((c) => c.text.startsWith('A mensagem é validada'));
    expect(schema?.section).toBe('5 Web Services > 5.1 Autorização > 5.1.1 Validação do Schema');
    expect(schema?.page).toBe(10);
    const cont = chunks.find((c) => c.text === 'Modalidades de contingência.');
    expect(cont?.section).toBe('6 Contingência');
  });

  it('usa Preâmbulo antes da primeira seção', () => {
    expect(chunks[0]).toMatchObject({ section: 'Preâmbulo', kind: 'prose' });
  });

  it('gera um chunk por linha da tabela de rejeições com rejectionCode', () => {
    const rows = chunks.filter((c) => c.kind === 'table-row');
    expect(rows.map((r) => r.metadata.rejectionCode)).toEqual(['204', '539']);
    expect(rows.every((r) => r.page === 11 && r.section.endsWith('5.2 Tabela de Códigos de Rejeição'))).toBe(true);
  });

  it('marca títulos como heading', () => {
    expect(chunks.filter((c) => c.kind === 'heading')).toHaveLength(5);
  });

  it('ids são únicos e estáveis entre execuções', () => {
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    expect(chunkDocument('moc', pages).map((c) => c.id)).toEqual(chunks.map((c) => c.id));
  });

  it('divide prosa longa com overlap', () => {
    const words = Array.from({ length: 200 }, (_, i) => `palavra${i}`);
    const long: PdfPage[] = [{ page: 1, lines: words }];
    const out = chunkDocument('d', long, { maxChars: 300, overlapChars: 60 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((c) => c.text.length <= 300 + 60 + 20)).toBe(true);
    const lastWordOfFirst = out[0]!.text.split(' ').at(-1)!;
    expect(out[1]!.text.split(' ')).toContain(lastWordOfFirst);
  });

  it('não confunde valores numéricos com títulos', () => {
    const out = chunkDocument('d', [{ page: 1, lines: ['1.500 itens | 20 unidades'] }]);
    expect(out[0]!.kind).toBe('prose');
  });
});
