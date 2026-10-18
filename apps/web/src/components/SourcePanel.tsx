import { useEffect, useRef } from 'react';
import type { Source } from '../api';

export function SourcePanel({ sources, cited, focused }: { sources: Source[]; cited: Set<string>; focused: string | null }) {
  const refs = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (focused) refs.current.get(focused)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focused]);

  const ordered = [...sources].sort((a, b) => Number(cited.has(b.chunkId)) - Number(cited.has(a.chunkId)));

  return (
    <aside aria-label="Fontes" className="max-h-[40dvh] overflow-y-auto border-t border-stone-200 bg-white md:max-h-none md:w-96 md:border-l md:border-t-0">
      <h2 className="sticky top-0 border-b border-stone-100 bg-white px-4 py-3 text-sm font-semibold">
        Trechos usados {sources.length > 0 && <span className="font-normal text-stone-500">({sources.length})</span>}
      </h2>
      {sources.length === 0 ? (
        <p className="px-4 py-6 text-sm text-stone-500">Os trechos recuperados da documentação aparecem aqui.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {ordered.map((s) => (
            <li
              key={s.chunkId}
              ref={(el) => { if (el) refs.current.set(s.chunkId, el); else refs.current.delete(s.chunkId); }}
              className={`px-4 py-3 text-sm transition-colors ${focused === s.chunkId ? 'bg-emerald-50' : ''} ${cited.has(s.chunkId) ? '' : 'opacity-60'}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-stone-500">
                <span className="truncate" title={s.section}>{s.documentId} · {s.section}</span>
                {cited.has(s.chunkId) && <span className="shrink-0 rounded bg-emerald-700 px-1.5 text-white">citado</span>}
              </div>
              <p className="leading-relaxed text-stone-800">{s.text}</p>
              <div className="mt-1 text-xs">
                {s.pdfUrl ? (
                  <a href={s.pdfUrl} target="_blank" rel="noreferrer" className="text-emerald-700 underline">Abrir PDF na página {s.page}</a>
                ) : (
                  <span className="text-stone-500">Página {s.page}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
