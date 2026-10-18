/**
 * Avaliação do FiscalMind.
 *
 *   pnpm eval                      offline (CI): corpus sintético + MemoryVectorStore + embedder determinístico; só recuperação
 *   pnpm eval --db                 base real (DATABASE_URL + VOYAGE_API_KEY), só recuperação
 *   pnpm eval --db --llm           base real + geração com Claude (ANTHROPIC_API_KEY): groundedness, correção e recusas
 *   pnpm eval --db --llm --cli     igual, mas usa o claude CLI local (sem ANTHROPIC_API_KEY)
 *   ... --update-baseline          grava o resultado como novo piso de regressão (apenas modo offline)
 *
 * Falha (exit 1) se alguma métrica ficar abaixo de data/eval/baseline.json.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ClaudeCliLlm } from '../packages/core/src/adapters/claude-cli-llm.js';
import { ClaudeLlm } from '../packages/core/src/adapters/claude-llm.js';
import { hashEmbedder } from '../packages/core/src/adapters/hash-embedder.js';
import { MemoryVectorStore } from '../packages/core/src/adapters/memory-store.js';
import { PgVectorStore } from '../packages/core/src/adapters/pg-vector-store.js';
import { voyageEmbeddings, voyageReranker } from '../packages/core/src/adapters/voyage.js';
import type { EvalCase } from '../packages/core/src/eval/metrics.js';
import { runEval, type CaseResult, type EvalSummary } from '../packages/core/src/eval/run-eval.js';
import { ingestDocument, type IngestInput } from '../packages/core/src/ingest/pipeline.js';
import type { RetrieveDeps } from '../packages/core/src/retrieval/retrieve.js';

const args = new Set(process.argv.slice(2));
const useDb = args.has('--db');
const useLlm = args.has('--llm');
const BASELINE = 'data/eval/baseline.json';
const METRICS = ['recallAtK', 'groundedness', 'correctness', 'refusalAccuracy'] as const;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não definida`);
  return v;
}

const cases = readFileSync('data/eval/perguntas.jsonl', 'utf8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as EvalCase);

let deps: RetrieveDeps;
let close = async () => {};
if (useDb) {
  const store = PgVectorStore.fromUrl(env('DATABASE_URL'));
  deps = { store, embedder: voyageEmbeddings(env('VOYAGE_API_KEY')), reranker: voyageReranker(env('VOYAGE_API_KEY')) };
  close = () => store.close();
} else {
  const store = new MemoryVectorStore();
  const embedder = hashEmbedder();
  const corpus = JSON.parse(readFileSync('tests/fixtures/corpus-sintetico.json', 'utf8')) as IngestInput;
  await ingestDocument(corpus, { store, embedder });
  deps = { store, embedder };
}

const mode = `${useDb ? 'base real' : 'offline (corpus sintético)'}${useLlm ? (args.has('--cli') ? ' + Claude (CLI local)' : ' + Claude') : ', só recuperação'}`;
let summary: EvalSummary;
let results: CaseResult[];
try {
  ({ summary, results } = await runEval(cases, useLlm ? { ...deps, llm: args.has('--cli') ? new ClaudeCliLlm() : new ClaudeLlm() } : deps));
} finally {
  await close();
}

const pct = (x: number | undefined) => (x === undefined ? '—' : `${(x * 100).toFixed(1)}%`);
const yn = (b: boolean | undefined) => (b === undefined ? '—' : b ? 'sim' : 'não');
const report = `# Relatório de avaliação — FiscalMind

- Data: ${new Date().toISOString().slice(0, 10)}
- Modo: ${mode}
- Casos: ${summary.casos} (${cases.filter((c) => c.foraDoEscopo).length} fora do escopo)

| Métrica | Valor |
|---|---|
| Recall@${summary.k} | ${pct(summary.recallAtK)} |
| Groundedness | ${pct(summary.groundedness)} |
| Correção | ${pct(summary.correctness)} |
| Recusas corretas (fora do escopo) | ${pct(summary.refusalAccuracy)} |

Recusar uma pergunta fora do escopo conta como acerto: é o comportamento desejado.

## Por pergunta

| id | pergunta | recall | rota | resultado | fundamentada | correta |
|---|---|---|---|---|---|---|
${results.map((r) => `| ${r.id} | ${r.pergunta.replace(/\|/g, '\\|')} | ${r.recall === null ? 'n/a' : pct(r.recall)} | ${r.answer?.route ?? '—'} | ${r.answer?.kind ?? '—'} | ${yn(r.answer?.grounded)} | ${r.answer ? yn(r.answer.correct || r.answer.refusedCorrectly) : '—'} |`).join('\n')}
`;

mkdirSync('report', { recursive: true });
const reportPath = useDb ? 'report/eval.md' : 'report/eval-offline.md';
writeFileSync(reportPath, report);
console.log(`Relatório: ${reportPath}`);
for (const m of METRICS) if (summary[m] !== undefined) console.log(`  ${m}: ${pct(summary[m])}`);

if (!useDb) {
  if (args.has('--update-baseline')) {
    writeFileSync(BASELINE, `${JSON.stringify({ recallAtK: summary.recallAtK }, null, 2)}\n`);
    console.log(`Baseline atualizado em ${BASELINE}`);
  } else {
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Partial<EvalSummary>;
    const regressions = METRICS.filter((m) => baseline[m] !== undefined && summary[m] !== undefined && summary[m]! < baseline[m]! - 1e-9);
    if (regressions.length) {
      console.error(`Regressão: ${regressions.map((m) => `${m} ${pct(summary[m])} < ${pct(baseline[m])}`).join(', ')}`);
      process.exitCode = 1;
    }
  }
}
