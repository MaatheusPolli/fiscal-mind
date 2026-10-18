import { useRef, useState, type FormEvent } from 'react';
import { streamChat, type ChatResult } from '../api';
import { CitationChip } from './CitationChip';

interface Turn {
  pergunta: string;
  texto: string;
  result?: ChatResult;
  erro?: string;
}

const EXEMPLOS = ['539', 'Qual o prazo para cancelar uma NF-e?', 'O que a carta de correção não pode alterar?', 'Qual a alíquota do IR em 2026?'];

export function Chat({ onResult, onFocusSource }: { onResult: (r: ChatResult) => void; onFocusSource: (chunkId: string) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const update = (i: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) =>
    setTurns((ts) => ts.map((t, j) => (j === i ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)));

  async function send(pergunta: string) {
    if (!pergunta.trim() || busy) return;
    const i = turns.length;
    setTurns((ts) => [...ts, { pergunta, texto: '' }]);
    setInput('');
    setBusy(true);
    try {
      const result = await streamChat(pergunta, {
        onDelta: (text) => {
          update(i, (t) => ({ texto: t.texto + text }));
          endRef.current?.scrollIntoView({ block: 'end' });
        },
      });
      update(i, { result, texto: result.resposta });
      onResult(result);
    } catch (e) {
      update(i, { erro: e instanceof Error ? e.message : 'Erro inesperado' });
    } finally {
      setBusy(false);
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Chat">
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6" aria-live="polite">
        {turns.length === 0 && (
          <div className="mx-auto max-w-xl text-center text-sm text-stone-500">
            <p className="mb-4">Pergunte sobre o Manual da NF-e, notas técnicas, CST, CFOP ou códigos de rejeição.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXEMPLOS.map((ex) => (
                <button key={ex} onClick={() => void send(ex)} className="rounded-full border border-stone-300 bg-white px-3 py-1 hover:border-emerald-600 hover:text-emerald-800">
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <article key={i} className="mx-auto max-w-2xl space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-700 px-4 py-2 text-white">{t.pergunta}</p>
            <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-3 shadow-sm">
              {t.erro ? (
                <p className="text-red-700">{t.erro}</p>
              ) : (
                <>
                  {t.result?.kind === 'refusal' && (
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Não encontrado na documentação</p>
                  )}
                  {t.result?.route === 'rejection-lookup' && (
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Consulta direta à tabela · sem IA</p>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">{t.texto || (busy && i === turns.length - 1 ? '…' : '')}</p>
                  {t.result && t.result.citacoes.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {t.result.citacoes.map((c, n) => {
                        const src = t.result!.fontes.find((f) => f.chunkId === c.chunkId);
                        return src ? (
                          <CitationChip key={`${c.chunkId}-${n}`} n={n + 1} source={src} trecho={c.trecho} onClick={() => { onResult(t.result!); onFocusSource(c.chunkId); }} />
                        ) : null;
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-stone-200 bg-white p-3">
        <label htmlFor="pergunta" className="sr-only">Pergunta</label>
        <input
          id="pergunta"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ex.: o que causa a rejeição 539?"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 focus:border-emerald-600 focus:outline-none"
        />
        <button disabled={busy || !input.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-40">
          {busy ? 'Buscando…' : 'Perguntar'}
        </button>
      </form>
    </section>
  );
}
