import type { FastifyPluginAsync } from 'fastify';
import { ask } from '../../../../packages/core/src/generation/answer.js';
import type { LlmClient } from '../../../../packages/core/src/ports/llm.js';
import type { ServerDeps } from '../server.js';
import { toSource } from './sources.js';

/** Sem LLM configurado, qualquer pergunta fora da rota determinística vira recusa explicada. */
const noLlm: LlmClient = {
  async answer() {
    return { encontrado: false, resposta: 'Geração desativada: configure ANTHROPIC_API_KEY. Consultas por código de rejeição (ex.: "539") funcionam sem ela.', citacoes: [] };
  },
};

/**
 * POST /api/chat → text/event-stream
 *   event: delta   data: {"text": "..."}          (texto da resposta em streaming)
 *   event: done    data: {kind, route, resposta, citacoes[], fontes[]}
 *   event: error   data: {"message": "..."}
 */
export const chatRoutes: FastifyPluginAsync<{ deps: ServerDeps }> = async (app, { deps }) => {
  app.post<{ Body: { pergunta: string } }>(
    '/api/chat',
    {
      schema: {
        body: {
          type: 'object',
          required: ['pergunta'],
          properties: { pergunta: { type: 'string', minLength: 1, maxLength: 1000 } },
        },
      },
    },
    async (req, reply) => {
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      try {
        const result = await ask(req.body.pergunta, { ...deps, llm: deps.llm ?? noLlm }, { onDelta: (text) => send('delta', { text }) });
        send('done', {
          kind: result.kind,
          route: result.route,
          resposta: result.resposta,
          motivo: result.kind === 'refusal' ? result.motivo : undefined,
          citacoes: result.kind === 'answer' ? result.citacoes.map((c) => ({ chunkId: c.chunk.id, trecho: c.trecho })) : [],
          fontes: result.contexto.map((c) => toSource(c.chunk, deps)),
        });
      } catch (err) {
        req.log.error(err);
        send('error', { message: 'Falha ao gerar a resposta. Tente novamente.' });
      } finally {
        res.end();
      }
    },
  );
};
