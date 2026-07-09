/**
 * Regression tests for the quadratic-backtracking (ReDoS) fixes in 0.11.5. Each pathological input
 * would take many seconds-to-minutes under the old unbounded regex; the bounded versions finish in
 * milliseconds. A synced/shared note or .bib file is attacker-controlled, so these run on hostile
 * input and must never freeze the main thread. The correctness cases prove the bounds didn't break
 * normal citations/attributes.
 */
import { describe, expect, test } from 'bun:test';
import { cleanDocument, splitSentences } from './text-cleaner';
import { parseBibFile, resolveCitations } from './citation-resolver';

// Generous ceiling: linear finishes in <50ms; quadratic at n=100k is >10^10 steps (many seconds).
const BUDGET_MS = 1000;
const N = 100_000;

function elapsed(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('ReDoS — stripPandocAttributes (via cleanDocument)', () => {
  test('a note of 100k "{" completes in linear time', () => {
    const ms = elapsed(() => cleanDocument('{'.repeat(N)));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test('still strips a real Pandoc attribute block', () => {
    const doc = cleanDocument('A heading {#id .unnumbered}\n\nBody text here.');
    const joined = doc.allSentences.join(' ');
    expect(joined).not.toContain('.unnumbered');
    expect(joined).not.toContain('{#id');
  });
});

describe('ReDoS — resolveCitations bracketed regex', () => {
  test('a note of 100k "[" completes in linear time', () => {
    const ms = elapsed(() => resolveCitations('['.repeat(N), new Map()));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test('still resolves a real bracketed citation', () => {
    const entries = new Map([
      ['smith2020', { key: 'smith2020', authors: ['Smith'], year: '2020', isInstitutional: false }],
    ]);
    expect(resolveCitations('See [@smith2020].', entries)).toBe('See (Smith, 2020).');
  });

  test('preserves an unknown key\'s text (brackets normalize to parens, key kept verbatim)', () => {
    // Pre-existing behavior: [@key] always becomes (...); an unknown key's text is kept as-is.
    expect(resolveCitations('See [@unknown].', new Map())).toBe('See (@unknown).');
  });
});

describe('ReDoS — parseBibFile entry lookahead', () => {
  test('an entry padded with 100k newlines completes in linear time', () => {
    const pathological = '@article{k,' + '\n'.repeat(N) + 'x';
    const ms = elapsed(() => parseBibFile(pathological));
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  test('still parses a normal two-entry bib file', () => {
    const bib = [
      '@article{smith2020, author = {Smith, John}, year = {2020}, title = {A}}',
      '@book{jones2019, author = {Jones, Amy}, year = {2019}, title = {B}}',
    ].join('\n');
    const entries = parseBibFile(bib);
    expect(entries.size).toBe(2);
    expect(entries.has('smith2020')).toBe(true);
    expect(entries.has('jones2019')).toBe(true);
  });
});

// Guards the module import surface used above (splitSentences is re-exported from the same file).
test('text-cleaner exports are wired', () => {
  expect(typeof splitSentences).toBe('function');
});
