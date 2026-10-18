import { ask, type AskDeps, type AskResult } from '../generation/answer.js';
import { retrieve, type RetrieveDeps } from '../retrieval/retrieve.js';
import { isCorrect, isGrounded, mean, recallAtK, type EvalCase } from './metrics.js';

export interface CaseResult {
  id: string;
  pergunta: string;
  recall: number | null;
  answer?: { route: AskResult['route']; kind: AskResult['kind']; grounded: boolean; correct: boolean; refusedCorrectly: boolean };
}

export interface EvalSummary {
  k: number;
  casos: number;
  /** Média de recall@k nas perguntas dentro do escopo. */
  recallAtK: number;
  /** Só com LLM: fração das respostas (não recusas) dentro do escopo que são fundamentadas. */
  groundedness?: number;
  /** Só com LLM: fração das perguntas dentro do escopo respondidas corretamente. */
  correctness?: number;
  /** Só com LLM: fração das perguntas fora do escopo que foram recusadas. */
  refusalAccuracy?: number;
}

export async function runEval(
  cases: EvalCase[],
  deps: RetrieveDeps & Partial<Pick<AskDeps, 'llm'>>,
  opts: { k?: number } = {},
): Promise<{ summary: EvalSummary; results: CaseResult[] }> {
  const k = opts.k ?? 5;
  const results: CaseResult[] = [];
  for (const c of cases) {
    const r: CaseResult = { id: c.id, pergunta: c.pergunta, recall: null };
    if (!c.foraDoEscopo) {
      const top = await retrieve(c.pergunta, deps, { topK: k });
      r.recall = recallAtK(top.map((t) => t.chunk), c.fontes, k);
    }
    if (deps.llm) {
      const out = await ask(c.pergunta, { ...deps, llm: deps.llm }, { retrieval: { topK: k } });
      r.answer = {
        route: out.route,
        kind: out.kind,
        grounded: isGrounded(out),
        correct: !c.foraDoEscopo && isCorrect(out, c.respostaEsperada),
        refusedCorrectly: !!c.foraDoEscopo && out.kind === 'refusal',
      };
    }
    results.push(r);
  }

  const inScope = results.filter((r) => r.recall !== null);
  const summary: EvalSummary = { k, casos: cases.length, recallAtK: mean(inScope.map((r) => r.recall!)) };
  if (deps.llm) {
    const answered = inScope.filter((r) => r.answer?.kind === 'answer');
    const outScope = results.filter((r) => r.recall === null);
    summary.groundedness = mean(answered.map((r) => Number(r.answer!.grounded)));
    summary.correctness = mean(inScope.map((r) => Number(r.answer!.correct)));
    summary.refusalAccuracy = outScope.length ? mean(outScope.map((r) => Number(r.answer!.refusedCorrectly))) : undefined;
  }
  return { summary, results };
}
