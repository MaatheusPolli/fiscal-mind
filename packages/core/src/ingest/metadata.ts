import type { ChunkMetadata } from '../domain/chunk.js';

/** Linha de tabela de rejeições: "539 | Rejeição: Duplicidade..." ou "539 Rejeição: ..." */
const REJECTION_ROW = /^\s*(\d{3})\s*\|?\s*(?:Rejei[çc][ãa]o|Uso Denegado|Denegado)\b/i;
/** Menção em prosa: "Rejeição 539", "rejeição nº 539", "cStat 539", "código 539". */
const REJECTION_MENTION = /(?:rejei[çc][ãa]o|\bcStat|\bc[óo]digo(?: de rejei[çc][ãa]o)?)\s*(?:n[º°o.]\s*)?[:=]?\s*(\d{3})\b(?![,.]\d)/i;
const CFOP = /\bCFOP\s*(?:n[º°o.]\s*)?[:=]?\s*([1-7])\.?(\d{3})\b/i;
const CST = /\b(?:CST|CSOSN)\s*(?:n[º°o.]\s*)?[:=]?\s*(\d{2,3})\b/i;

export function extractMetadata(text: string): ChunkMetadata {
  const meta: ChunkMetadata = {};
  const rejection = REJECTION_ROW.exec(text) ?? REJECTION_MENTION.exec(text);
  if (rejection) meta.rejectionCode = rejection[1];
  const cfop = CFOP.exec(text);
  if (cfop) meta.cfop = `${cfop[1]}${cfop[2]}`;
  const cst = CST.exec(text);
  if (cst) meta.cst = cst[1];
  return meta;
}

export function isRejectionRow(line: string): boolean {
  return REJECTION_ROW.test(line);
}
