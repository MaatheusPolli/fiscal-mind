import type { Source } from '../api';

export function CitationChip({ n, source, trecho, onClick }: { n: number; source: Source; trecho: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`“${trecho}”`}
      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900 hover:bg-emerald-100"
    >
      <span className="font-semibold">[{n}]</span>
      <span className="max-w-48 truncate">{source.section}</span>
      <span className="text-emerald-700">· p. {source.page}</span>
    </button>
  );
}
