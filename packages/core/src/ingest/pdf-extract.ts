export interface PdfPage {
  page: number;
  /** Linhas em ordem de leitura; colunas separadas por " | " quando há lacuna horizontal grande. */
  lines: string[];
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

const LINE_TOLERANCE = 2;
const COLUMN_GAP = 12;

/** Agrupa itens de texto posicionados em linhas e detecta colunas de tabela por lacunas horizontais. */
export function itemsToLines(items: TextItem[]): string[] {
  const rows: TextItem[][] = [];
  const sorted = items.filter((i) => i.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0]!.y - item.y) <= LINE_TOLERANCE) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let line = '';
    let prevEnd: number | null = null;
    for (const item of row) {
      if (prevEnd !== null) {
        const gap = item.x - prevEnd;
        line += gap > COLUMN_GAP ? ' | ' : gap > 0.5 ? ' ' : '';
      }
      line += item.str;
      prevEnd = item.x + item.width;
    }
    return line.replace(/\s+/g, ' ').trim();
  });
}

export async function extractPdf(data: Uint8Array): Promise<PdfPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const it of content.items) {
      if ('str' in it) items.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width });
    }
    pages.push({ page: n, lines: itemsToLines(items) });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}
