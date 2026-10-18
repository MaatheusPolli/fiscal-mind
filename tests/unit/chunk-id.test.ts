import { describe, expect, it } from 'vitest';
import { chunkId } from '../../packages/core/src/domain/chunk.js';

describe('chunkId', () => {
  it('é determinístico', () => {
    expect(chunkId('moc', '5.1', 0)).toBe(chunkId('moc', '5.1', 0));
  });
  it('muda com documento, seção ou índice', () => {
    const ids = new Set([chunkId('moc', '5.1', 0), chunkId('moc', '5.1', 1), chunkId('moc', '5.2', 0), chunkId('nt', '5.1', 0)]);
    expect(ids.size).toBe(4);
  });
});
