import Anthropic from '@anthropic-ai/sdk';
import type { CitedAnswer, LlmClient } from '../ports/llm.js';

const TOOL_NAME = 'responder';

/** `resposta` vem primeiro no schema para que o texto chegue cedo no streaming. */
export const ANSWER_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    'Entrega a resposta final ao usuário com as citações que a sustentam. Use encontrado=false quando o contexto não permitir responder.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['resposta', 'encontrado', 'citacoes'],
    properties: {
      resposta: { type: 'string', description: 'Resposta em português, baseada apenas no contexto.' },
      encontrado: { type: 'boolean', description: 'false se o contexto não sustenta uma resposta.' },
      citacoes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['chunkId', 'trecho'],
          properties: {
            chunkId: { type: 'string', description: 'Atributo id do <trecho> citado.' },
            trecho: { type: 'string', description: 'Cópia literal da parte do trecho que sustenta a afirmação.' },
          },
        },
      },
    },
  },
};

/**
 * Extrai o valor (possivelmente incompleto) do campo "resposta" de um JSON parcial.
 * Usado apenas para exibir o texto em streaming; a validação usa o JSON final.
 */
export function partialResposta(partialJson: string): string {
  const m = /"resposta"\s*:\s*"/.exec(partialJson);
  if (!m) return '';
  let raw = '';
  for (let i = m.index + m[0].length; i < partialJson.length; i++) {
    const ch = partialJson[i]!;
    if (ch === '\\') {
      const next = partialJson[i + 1];
      if (next === undefined) break;
      if (next === 'u') {
        const hex = partialJson.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        raw += `\\u${hex}`;
        i += 5;
      } else {
        raw += `\\${next}`;
        i += 1;
      }
      continue;
    }
    if (ch === '"') break;
    raw += ch;
  }
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return '';
  }
}

export function parseAnswerInput(input: unknown): CitedAnswer {
  const o = input as Partial<CitedAnswer> | null;
  if (
    !o || typeof o.resposta !== 'string' || typeof o.encontrado !== 'boolean' || !Array.isArray(o.citacoes) ||
    !o.citacoes.every((c) => c && typeof c.chunkId === 'string' && typeof c.trecho === 'string')
  ) {
    throw new Error('Entrada da ferramenta responder fora do schema');
  }
  return { resposta: o.resposta, encontrado: o.encontrado, citacoes: o.citacoes };
}

export interface ClaudeLlmOptions {
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

export class ClaudeLlm implements LlmClient {
  constructor(
    private readonly client: Anthropic = new Anthropic(),
    private readonly opts: ClaudeLlmOptions = {},
  ) {}

  async answer({ system, messages, onDelta }: Parameters<LlmClient['answer']>[0]): Promise<CitedAnswer> {
    // tool_choice "auto" + instrução no system: compatível com thinking adaptativo
    // (tool use forçado não combina com thinking e é rejeitado nos modelos mais novos).
    const stream = this.client.messages.stream({
      model: this.opts.model ?? 'claude-opus-5',
      max_tokens: this.opts.maxTokens ?? 8000,
      thinking: { type: 'adaptive' },
      output_config: { effort: this.opts.effort ?? 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: [ANSWER_TOOL],
      tool_choice: { type: 'auto' },
      messages,
    });

    if (onDelta) {
      let json = '';
      let emitted = 0;
      stream.on('streamEvent', (event) => {
        if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
          json += event.delta.partial_json;
          const text = partialResposta(json);
          if (text.length > emitted) {
            onDelta(text.slice(emitted));
            emitted = text.length;
          }
        }
      });
    }

    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      return { encontrado: false, resposta: 'Não posso responder a essa pergunta.', citacoes: [] };
    }
    if (message.stop_reason === 'max_tokens') throw new Error('Resposta truncada (max_tokens)');
    const tool = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === TOOL_NAME);
    // Sem chamada da ferramenta não há citação verificável: tratamos como "não encontrado".
    if (!tool) return { encontrado: false, resposta: '', citacoes: [] };
    return parseAnswerInput(tool.input);
  }
}
