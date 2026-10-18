import Fastify, { type FastifyInstance } from 'fastify';
import type { AskDeps } from '../../../packages/core/src/generation/answer.js';
import type { RetrieveDeps } from '../../../packages/core/src/retrieval/retrieve.js';
import { chatRoutes } from './routes/chat.js';
import { healthRoutes } from './routes/health.js';
import { searchRoutes } from './routes/search.js';

export interface ServerDeps extends RetrieveDeps {
  /** Ausente: só a rota determinística de rejeição funciona no chat. */
  llm?: AskDeps['llm'];
  /** Resolve a URL pública do PDF de um documento (para o link "ver página"). */
  pdfUrl?: (documentId: string) => string | undefined;
  mode: string;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(healthRoutes, { deps });
  app.register(searchRoutes, { deps });
  app.register(chatRoutes, { deps });
  return app;
}
