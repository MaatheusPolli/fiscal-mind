# FiscalMind

Assistente RAG sobre a documentação da NF-e (Manual de Orientação do Contribuinte, Notas Técnicas, tabelas de CST/CFOP) que **sempre cita a fonte — ou diz que não encontrou**.

> Ferramenta informativa sobre documentação pública. Não é consultoria fiscal.

<!-- GIF: docs/demo.gif — chat respondendo "rejeição 539" com citação e painel de fontes -->

## Por que

Um LLM sozinho inventa números de rejeição e regras com toda a confiança. No domínio fiscal, isso é pior do que não responder. O FiscalMind trata a citação como **estrutura verificável**, não como texto:

1. O Claude responde por uma ferramenta (`responder`) com `{ resposta, encontrado, citacoes: [{ chunkId, trecho }] }`.
2. Um guardrail confere cada citação: o `chunkId` precisa estar no contexto enviado **e** o trecho precisa aparecer literalmente naquele chunk.
3. Sem nenhuma citação válida, a resposta vira recusa. Recusar uma pergunta fora do escopo conta como acerto na avaliação.

## Arquitetura

```
PDF ─► extração (pdfjs, por página) ─► chunker hierárquico ─► metadados (rejeição/CST/CFOP) ─► embeddings
                                        (seção > subseção,     │
                                         1 chunk por linha      ▼
                                         da tabela)       PostgreSQL + pgvector (HNSW) + tsvector (português)

Pergunta ─┬─ "539" / "rejeição 539" ─► índice de metadados ─► resposta direta, sem LLM
          └─ demais ─► vetorial ∥ full-text ─► RRF ─► rerank ─► contexto limitado por tokens
                                                                   │
                                        Claude (streaming, tool use) ─► guardrail ─► resposta + citações | recusa
```

- **Ports & Adapters**: `EmbeddingProvider`, `VectorStore`, `Reranker`, `LlmClient` são interfaces. Adapters: Postgres/pgvector, Voyage (`voyage-3` + `rerank-2`), Claude, e versões em memória para testes e avaliação offline.
- **Ingestão idempotente**: ids de chunk estáveis (`sha256(documento, seção, índice)`) e hash de conteúdo por documento; reingerir sem mudanças não faz nada.
- **Custo**: system prompt estável com prompt caching; contexto limitado por tokens, não por número de chunks.

## Rodando

Requisitos: Node 20+, pnpm 9. Docker, para o Postgres.

```bash
pnpm install
```

**Modo demo** (sem banco nem chaves; usa um corpus sintético de testes):

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Abra http://localhost:5173. Sem `ANTHROPIC_API_KEY`, só a consulta por código de rejeição responde. As outras perguntas mostram os trechos recuperados e uma recusa explicada.

**Com a documentação real:**

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `VOYAGE_API_KEY` e `ANTHROPIC_API_KEY`.
2. Suba o banco: `pnpm db:up`.
3. Baixe os PDFs das URLs oficiais listadas em `data/sources.json` para `data/sources/<id>.pdf`. Os PDFs não são versionados.
4. Rode `pnpm ingest`, depois `pnpm dev:api` e `pnpm dev:web`.

## Qualidade

```bash
pnpm test
```

```bash
pnpm eval
```

- Testes unitários: chunker, metadados (com falsos positivos como `R$ 539,00`), RRF, guardrail, rota determinística, adapter do Claude com stream simulado e API via `inject`.
- Integração (`tests/integration`): Postgres + pgvector em Testcontainers, com cerca de 200 chunks. Roda na CI ou localmente com `RUN_INTEGRATION=1`.
- Avaliação: `data/eval/perguntas.jsonl` traz perguntas no escopo e fora dele. `pnpm eval` roda offline na CI e falha se o recall@5 cair abaixo de `data/eval/baseline.json`. `pnpm eval --db --llm` mede recall@5, groundedness, correção e recusas na base real e grava em [`report/eval.md`](report/eval.md).

## Stack

TypeScript · Claude (`@anthropic-ai/sdk`: tool use, streaming, prompt caching) · Voyage AI · PostgreSQL + pgvector · pdfjs-dist · Fastify (SSE) · React + Vite + Tailwind · Vitest + Testcontainers
