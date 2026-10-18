import { EventEmitter } from 'node:events';
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { ClaudeLlm } from '../../packages/core/src/adapters/claude-llm.js';

/** Stream falso: emite eventos de input_json_delta e resolve a mensagem final. */
function fakeClient(chunks: string[], final: Partial<Anthropic.Message>) {
  const create = vi.fn(() => {
    const em = new EventEmitter();
    return {
      on: (ev: string, fn: (e: unknown) => void) => em.on(ev, fn),
      finalMessage: async () => {
        for (const partial_json of chunks) {
          em.emit('streamEvent', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json } });
        }
        return { stop_reason: 'tool_use', content: [], ...final } as Anthropic.Message;
      },
    };
  });
  return { client: { messages: { stream: create } } as unknown as Anthropic, create };
}

const input = { resposta: 'Até 24 horas.', encontrado: true, citacoes: [{ chunkId: 'p1', trecho: '24 horas' }] };

describe('ClaudeLlm', () => {
  it('envia system com cache_control, ferramenta strict e faz streaming da resposta', async () => {
    const json = JSON.stringify(input);
    const { client, create } = fakeClient([json.slice(0, 20), json.slice(20)], {
      content: [{ type: 'tool_use', id: 't', name: 'responder', input } as Anthropic.ToolUseBlock],
    });
    const deltas: string[] = [];
    const out = await new ClaudeLlm(client).answer({ system: 'S', messages: [{ role: 'user', content: 'q' }], onDelta: (d) => deltas.push(d) });

    expect(out).toEqual(input);
    expect(deltas.join('')).toBe('Até 24 horas.');
    const params = (create.mock.calls[0] as unknown as [Anthropic.MessageCreateParams])[0];
    expect(params.model).toBe('claude-opus-5');
    expect(params.system).toEqual([{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
    expect(params.tools?.[0]).toMatchObject({ name: 'responder', strict: true });
  });

  it('sem chamada de ferramenta devolve encontrado=false', async () => {
    const { client } = fakeClient([], { stop_reason: 'end_turn', content: [] });
    expect((await new ClaudeLlm(client).answer({ system: 'S', messages: [] })).encontrado).toBe(false);
  });

  it('refusal do modelo vira encontrado=false; max_tokens lança', async () => {
    expect((await new ClaudeLlm(fakeClient([], { stop_reason: 'refusal' }).client).answer({ system: 'S', messages: [] })).encontrado).toBe(false);
    await expect(new ClaudeLlm(fakeClient([], { stop_reason: 'max_tokens' }).client).answer({ system: 'S', messages: [] })).rejects.toThrow();
  });
});
