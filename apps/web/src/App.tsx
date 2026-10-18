import { useState } from 'react';
import type { Source } from './api';
import { Chat } from './components/Chat';
import { SourcePanel } from './components/SourcePanel';

export function App() {
  const [sources, setSources] = useState<Source[]>([]);
  const [cited, setCited] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <div className="flex h-dvh flex-col bg-stone-50 text-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Fiscal<span className="text-emerald-700">Mind</span>
        </h1>
        <p className="text-xs text-stone-500">Respostas com fonte obrigatória — ou "não encontrei".</p>
      </header>
      <div role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
        Ferramenta informativa sobre a documentação pública da NF-e. Não é consultoria fiscal.
      </div>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Chat
          onResult={(r) => {
            setSources(r.fontes);
            setCited(new Set(r.citacoes.map((c) => c.chunkId)));
            setFocused(r.citacoes[0]?.chunkId ?? null);
          }}
          onFocusSource={setFocused}
        />
        <SourcePanel sources={sources} cited={cited} focused={focused} />
      </main>
    </div>
  );
}
