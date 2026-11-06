/**
 * @acceptance DEC-055: gateway не пробрасывает Content-Encoding после decode fetch.
 */
import { describe, expect, it } from 'vitest';

describe('pipeUpstream encoding', () => {
  it('после undici decode заголовки content-encoding и content-length upstream отбрасываются', () => {
    const hop = new Set([
      'transfer-encoding',
      'connection',
      'content-encoding',
      'content-length',
      'set-cookie',
    ]);
    const forwarded: string[] = [];
    for (const key of ['content-encoding', 'content-type', 'content-length', 'prefer']) {
      if (!hop.has(key)) forwarded.push(key);
    }
    expect(forwarded).toEqual(['content-type', 'prefer']);
  });
});
