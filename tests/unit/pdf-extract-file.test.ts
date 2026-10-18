import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPdf } from '../../packages/core/src/ingest/pdf-extract.js';

describe('extractPdf (fixture real)', () => {
  it('extrai páginas e linhas com colunas de tabela separadas', async () => {
    const data = new Uint8Array(readFileSync('tests/fixtures/pdf-trechos/tabela-rejeicao.pdf'));
    const pages = await extractPdf(data);
    expect(pages.map((p) => p.page)).toEqual([1, 2]);
    expect(pages[0]!.lines).toContain('5.2 Tabela de rejeicoes');
    expect(pages[0]!.lines).toContain('539 | Duplicidade');
    expect(pages[1]!.lines).toContain('225 | Rejeicao de validacao');
  });
});
