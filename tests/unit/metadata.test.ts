import { describe, expect, it } from 'vitest';
import { extractMetadata, isRejectionRow } from '../../packages/core/src/ingest/metadata.js';

describe('extractMetadata', () => {
  it.each([
    ['539 | Rejeição: Duplicidade de NF-e, com diferença na Chave de Acesso', '539'],
    ['204 Rejeicao: Duplicidade de NF-e', '204'],
    ['302 | Uso Denegado: Irregularidade fiscal do destinatário', '302'],
    ['A SEFAZ retorna a Rejeição 539 quando a chave diverge.', '539'],
    ['Consulte o cStat=225 no retorno.', '225'],
    ['código de rejeição nº 612', '612'],
  ])('extrai código de rejeição de %j', (text, code) => {
    expect(extractMetadata(text).rejectionCode).toBe(code);
  });

  it.each([
    'O valor total foi de R$ 539,00 na operação.',
    'Foram emitidas 539 notas no período.',
    'Ver página 539 do manual.',
    'Rejeição 539,50 não é código.',
  ])('não gera falso positivo em %j', (text) => {
    expect(extractMetadata(text).rejectionCode).toBeUndefined();
  });

  it('extrai CFOP com e sem ponto', () => {
    expect(extractMetadata('Utilize o CFOP 5.102 para venda').cfop).toBe('5102');
    expect(extractMetadata('CFOP: 6108').cfop).toBe('6108');
    expect(extractMetadata('valor 5.102,00').cfop).toBeUndefined();
  });

  it('extrai CST e CSOSN', () => {
    expect(extractMetadata('Tributação com CST 00').cst).toBe('00');
    expect(extractMetadata('CSOSN 102 - Simples Nacional').cst).toBe('102');
  });
});

describe('isRejectionRow', () => {
  it('só reconhece linhas que começam com código', () => {
    expect(isRejectionRow('539 | Rejeição: Duplicidade')).toBe(true);
    expect(isRejectionRow('Ver Rejeição 539')).toBe(false);
  });
});
