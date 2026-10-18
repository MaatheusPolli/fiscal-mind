import { describe, expect, it } from 'vitest';
import type { Chunk } from '../../packages/core/src/domain/chunk.js';
import { applyGuardrail, REFUSAL_TEXT } from '../../packages/core/src/generation/guardrail.js';

const chunk = (id: string, text: string): Chunk => ({ id, documentId: 'moc', text, section: '5.2', page: 11, kind: 'prose', metadata: {} });
const ctx = [
  chunk('c1', 'A rejeição 539 ocorre quando há duplicidade de NF-e com diferença na Chave de Acesso.'),
  chunk('c2', 'O prazo de cancelamento é de 24 horas após a autorização.'),
];

describe('applyGuardrail', () => {
  it('aceita citações presentes no contexto e com trecho literal', () => {
    const out = applyGuardrail(
      { encontrado: true, resposta: 'Duplicidade.', citacoes: [{ chunkId: 'c1', trecho: 'duplicidade de NF-e   com diferença' }] },
      ctx,
    );
    expect(out).toMatchObject({ kind: 'answer', descartadas: 0 });
    if (out.kind === 'answer') expect(out.citacoes[0]!.chunk.id).toBe('c1');
  });

  it('rejeita resposta que cita chunkId ausente do contexto', () => {
    const out = applyGuardrail({ encontrado: true, resposta: 'x', citacoes: [{ chunkId: 'inventado', trecho: 'duplicidade' }] }, ctx);
    expect(out).toEqual({ kind: 'refusal', motivo: 'sem-citacao-valida', resposta: REFUSAL_TEXT });
  });

  it('rejeita trecho que não existe no chunk citado', () => {
    const out = applyGuardrail({ encontrado: true, resposta: 'x', citacoes: [{ chunkId: 'c2', trecho: 'prazo de 48 horas' }] }, ctx);
    expect(out.kind).toBe('refusal');
  });

  it('resposta sem citação vira recusa', () => {
    expect(applyGuardrail({ encontrado: true, resposta: 'Com certeza é 539.', citacoes: [] }, ctx).kind).toBe('refusal');
  });

  it('respeita encontrado=false do modelo', () => {
    const out = applyGuardrail({ encontrado: false, resposta: 'Não há menção a CT-e.', citacoes: [] }, ctx);
    expect(out).toEqual({ kind: 'refusal', motivo: 'modelo-nao-encontrou', resposta: 'Não há menção a CT-e.' });
  });

  it('descarta citações inválidas e duplicadas mantendo as válidas', () => {
    const out = applyGuardrail(
      {
        encontrado: true,
        resposta: 'x',
        citacoes: [
          { chunkId: 'c2', trecho: '24 horas' },
          { chunkId: 'c2', trecho: '24  HORAS' },
          { chunkId: 'zz', trecho: '24 horas' },
          { chunkId: 'c1', trecho: '   ' },
        ],
      },
      ctx,
    );
    expect(out).toMatchObject({ kind: 'answer', descartadas: 3 });
  });
});
