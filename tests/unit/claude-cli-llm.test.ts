import { describe, expect, it } from 'vitest';
import { ClaudeCliLlm, extractJsonObject } from '../../packages/core/src/adapters/claude-cli-llm.js';

const json = { resposta: 'Rejeição 539 é duplicidade.', encontrado: true, citacoes: [{ chunkId: 'c1', trecho: 'Duplicidade' }] };

describe('ClaudeCliLlm', () => {
  it('envia o prompt pela entrada e valida o JSON da saída', async () => {
    let seen = '';
    const llm = new ClaudeCliLlm({
      runner: async (_a, stdin) => {
        seen = stdin;
        return JSON.stringify({ is_error: false, result: '```json\n' + JSON.stringify(json) + '\n```' });
      },
    });
    const deltas: string[] = [];
    const out = await llm.answer({ system: 'SYS', messages: [{ role: 'user', content: 'o que é 539?' }], onDelta: (t) => deltas.push(t) });
    expect(out).toEqual(json);
    expect(deltas).toEqual([json.resposta]);
    expect(seen).toContain('SYS');
    expect(seen).toContain('Usuário: o que é 539?');
  });

  it('falha quando a ferramenta retorna erro ou JSON fora do schema', async () => {
    const erro = new ClaudeCliLlm({ runner: async () => JSON.stringify({ is_error: true, result: 'x' }) });
    await expect(erro.answer({ system: '', messages: [] })).rejects.toThrow('erro');
    const invalido = new ClaudeCliLlm({ runner: async () => JSON.stringify({ result: '{"resposta": 1}' }) });
    await expect(invalido.answer({ system: '', messages: [] })).rejects.toThrow('fora do schema');
  });

  it('extractJsonObject exige um objeto', () => {
    expect(() => extractJsonObject('sem json')).toThrow('sem JSON');
  });
});
