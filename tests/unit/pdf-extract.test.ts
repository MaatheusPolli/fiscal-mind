import { describe, expect, it } from 'vitest';
import { itemsToLines } from '../../packages/core/src/ingest/pdf-extract.js';

describe('itemsToLines', () => {
  it('agrupa por linha, ordena de cima para baixo e separa colunas', () => {
    const lines = itemsToLines([
      { str: 'Rejeição: Duplicidade', x: 80, y: 700, width: 100 },
      { str: '539', x: 40, y: 701, width: 18 },
      { str: '5.2 Tabela', x: 40, y: 720, width: 60 },
      { str: 'de', x: 101, y: 720, width: 10 },
      { str: '   ', x: 0, y: 650, width: 5 },
    ]);
    expect(lines).toEqual(['5.2 Tabela de', '539 | Rejeição: Duplicidade']);
  });
});
