import type { FastifyPluginAsync } from 'fastify';
import type { ServerDeps } from '../server.js';

export const healthRoutes: FastifyPluginAsync<{ deps: ServerDeps }> = async (app, { deps }) => {
  app.get('/api/health', async () => ({ status: 'ok', mode: deps.mode, llm: !!deps.llm }));
};
