# FiscalMind

Assistente RAG sobre a documentaÃ§Ã£o da NF-e (Manual de OrientaÃ§Ã£o do Contribuinte, Notas TÃ©cnicas, tabelas de CST/CFOP) que **sempre cita a fonte â€” ou diz que nÃ£o encontrou**.

> Ferramenta informativa sobre documentaÃ§Ã£o pÃºblica. NÃ£o Ã© consultoria fiscal.

<!-- GIF: docs/demo.gif â€” chat respondendo "rejeiÃ§Ã£o 539" com citaÃ§Ã£o e painel de fontes -->

## Por que

Um LLM sozinho inventa nÃºmeros de rejeiÃ§Ã£o e regras com toda a confianÃ§a. No domÃ­nio fiscal, isso Ã© pior do que nÃ£o responder. O FiscalMind trata a citaÃ§Ã£o como **estrutura verificÃ¡vel**, nÃ£o como texto:

1. O Claude responde por uma ferramenta (`responder`) com `{ resposta, encontrado, citacoes: [{ chunkId, trecho }] }`.
2. Um guardrail confere cada citaÃ§Ã£o: o `chunkId` precisa estar no contexto enviado **e** o trecho precisa aparecer literalmente naquele chunk.
3. Sem nenhuma citaÃ§Ã£o vÃ¡lida, a resposta vira recusa. Recusar uma pergunta fora do escopo conta como acerto na avaliaÃ§Ã£o.

## Arquitetura

```
PDF â”€â–º extraÃ§Ã£o (pdfjs, por pÃ¡gina) â”€â–º chunker hierÃ¡rquico â”€â–º metadados (rejeiÃ§Ã£o/CST/CFOP) â”€â–º embeddings
                                        (seÃ§Ã£o > subseÃ§Ã£o,     â”‚
                                         1 chunk por linha      â–¼
                                         da tabela)       PostgreSQL + pgvector (HNSW) + tsvector (portuguÃªs)

Pergunta â”€â”¬â”€ "539" / "rejeiÃ§Ã£o 539" â”€â–º Ã­ndice de metadados â”€â–º resposta direta, sem LLM
          â””â”€ demais â”€â–º vetorial âˆ¥ full-text â”€â–º RRF â”€â–º rerank â”€â–º contexto limitado por tokens
                                                                   â”‚
                                        Claude (streaming, tool use) â”€â–º guardrail â”€â–º resposta + citaÃ§Ãµes | recusa
```

- **Ports & Adapters**: `EmbeddingProvider`, `VectorStore`, `Reranker`, `LlmClient` sÃ£o interfaces. Adapters: Postgres/pgvector, Voyage (`voyage-3` + `rerank-2`), Claude, e versÃµes em memÃ³ria para testes e avaliaÃ§Ã£o offline.
- **IngestÃ£o idempotente**: ids de chunk estÃ¡veis (`sha256(documento, seÃ§Ã£o, Ã­ndice)`) e hash de conteÃºdo por documento; reingerir sem mudanÃ§as nÃ£o faz nada.
- **Custo**: system prompt estÃ¡vel com prompt caching; contexto limitado por tokens, nÃ£o por nÃºmero de chunks.

## Rodando

Requisitos: Node 20+, pnpm 9. Docker, para o Postgres.

```bash
pnpm install
```

**Modo demo** (sem banco nem chaves; usa um corpus sintÃ©tico de testes):

```bash
pnpm dev:api
```

```bash
pnpm dev:web
```

Abra http://localhost:5173. Sem `ANTHROPIC_API_KEY`, sÃ³ a consulta por cÃ³digo de rejeiÃ§Ã£o responde. As outras perguntas mostram os trechos recuperados e uma recusa explicada.

**Com a documentaÃ§Ã£o real:**

1. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `VOYAGE_API_KEY` e `ANTHROPIC_API_KEY`.
2. Suba o banco: `pnpm db:up`.
3. Baixe os PDFs das URLs oficiais listadas em `data/sources.json` para `data/sources/<id>.pdf`. Os PDFs nÃ£o sÃ£o versionados.
4. Rode `pnpm ingest`, depois `pnpm dev:api` e `pnpm dev:web`.

## Qualidade

```bash
pnpm test
```

```bash
pnpm eval
```

- Testes unitÃ¡rios: chunker, metadados (com falsos positivos como `R$ 539,00`), RRF, guardrail, rota determinÃ­stica, adapter do Claude com stream simulado e API via `inject`.
- IntegraÃ§Ã£o (`tests/integration`): Postgres + pgvector em Testcontainers, com cerca de 200 chunks. Roda na CI ou localmente com `RUN_INTEGRATION=1`.
- AvaliaÃ§Ã£o: `data/eval/perguntas.jsonl` traz perguntas no escopo e fora dele. `pnpm eval` roda offline na CI e falha se o recall@5 cair abaixo de `data/eval/baseline.json`. `pnpm eval --db --llm` mede recall@5, groundedness, correÃ§Ã£o e recusas na base real e grava em [`report/eval.md`](report/eval.md).

## Stack

TypeScript Â· Claude (`@anthropic-ai/sdk`: tool use, streaming, prompt caching) Â· Voyage AI Â· PostgreSQL + pgvector Â· pdfjs-dist Â· Fastify (SSE) Â· React + Vite + Tailwind Â· Vitest + Testcontainers


## Licença

### Uso Pessoal
Este projeto é licenciado sob a **Licença MIT** para uso pessoal, educacional e não comercial.

### Uso Comercial
Se você deseja usar este projeto comercialmente, deve obter uma licença comercial do autor.

**Uso comercial inclui:**
- Incorporar em um produto comercial
- Oferecer como serviço
- Usar em atividades com fins lucrativos
- Implantação empresarial

**Para obter uma licença comercial:**
Email: ma.polli@hotmail.com
