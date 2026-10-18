import type { FastifyPluginAsync } from 'fastify';
import { retrieve } from '../../../../packages/core/src/retrieval/retrieve.js';
import type { ServerDeps } from '../server.js';
import { toSource } from './sources.js';

export const searchRoutes: FastifyPluginAsync<{ deps: ServerDeps }> = async (app, { deps }) => {
  app.post<{ Body: { q: string; k?: number } }>(
    '/api/search',
    {
      schema: {
        body: {
          type: 'object',
          required: ['q'],
          properties: { q: { type: 'string', minLength: 1, maxLength: 500 }, k: { type: 'integer', minimum: 1, maximum: 20 } },
        },
      },
    },
    async (req) => {
      const results = await retrieve(req.body.q, deps, { topK: req.body.k ?? 5 });
      return { results: results.map((r) => ({ ...toSource(r.chunk, deps), score: r.score })) };
    },
  );
};
