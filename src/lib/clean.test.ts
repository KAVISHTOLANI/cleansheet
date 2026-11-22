import { describe, expect, it } from 'vitest';
import { applyOps, cleanCell, DEFAULT_OPS, detect, visualise, type Ops } from './clean';

const rows = [
  [' Ada ', 'ada@example.com', 'London'],
  ['Ben', 'ben@example.com', 'Paris'],
  [' Ada ', 'ada@example.com', 'London'],
  ['ada', 'ADA@example.com', 'london'],
  ['', '', ''],
  ['Cy  Doe', 'NA', 'Berlin '],
];

describe('detect', () => {
  it('counts each kind of issue', () => {
    expect(detect(rows)).toEqual({ leadingTrailing: 3, doubleSpaces: 1, nbsp: 1, missingMarkers: 1, emptyRows: 1, exactDuplicates: 1, caseDuplicates: 1 });
  });
});

describe('cleaning', () => {
  it('cleans cells according to options', () => {
    expect(cleanCell('  a   b ', 0, DEFAULT_OPS)).toBe('a b');
    expect(cleanCell('N/A', 0, { ...DEFAULT_OPS, blankMarkers: true })).toBe('');
    expect(cleanCell("o'brien-smith", 0, { ...DEFAULT_OPS, caseColumns: { 0: 'title' } })).toBe("O'Brien-Smith");
    expect(cleanCell('x', 1, { ...DEFAULT_OPS, caseColumns: { 0: 'upper' } })).toBe('x');
  });
  it('removes exact duplicates and empty rows after cleaning, tracking changes', () => {
    const r = applyOps(['name', 'email', 'city'], rows, DEFAULT_OPS);
    expect(r.rows).toEqual([['Ada', 'ada@example.com', 'London'], ['Ben', 'ben@example.com', 'Paris'], ['ada', 'ADA@example.com', 'london'], ['Cy Doe', 'NA', 'Berlin']]);
    expect(r.removed.map((x) => x.reason)).toEqual(['Duplicate of row 2', 'Empty row']);
    expect(r.cellChanges).toBe(3); // row 1 name; row 6 name and city (row 3's change is dropped with the row)
    expect(r.sourceIndex).toEqual([0, 1, 3, 5]);
    expect(r.log.join(' ')).toMatch(/Removed 1 duplicate row/);
  });
  it('supports loose and key-based duplicate detection and dropping columns', () => {
    const loose = applyOps(['name', 'email', 'city'], rows, { ...DEFAULT_OPS, dedupe: 'loose' });
    expect(loose.rows).toHaveLength(3);
    const key: Ops = { ...DEFAULT_OPS, dedupe: 'key', keyColumns: [1], dropColumns: [2] };
    const k = applyOps(['name', 'email', 'city'], rows, key);
    expect(k.headers).toEqual(['name', 'email']);
    expect(k.rows.map((r) => r[1])).toEqual(['ada@example.com', 'ben@example.com', 'NA']);
  });
  it('makes invisible characters visible', () => {
    expect(visualise('  a  b ')).toBe('··a··b⍽');
  });
});
