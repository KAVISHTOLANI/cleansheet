import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCSV, toCSV } from './csv';

describe('csv', () => {
  it('parses quotes, escaped quotes, newlines in fields and CRLF', () => {
    const p = parseCSV('name,note\r\n"Smith, Jo","said ""hi""\nthen left"\r\nAda,ok\r\n');
    expect(p.headers).toEqual(['name', 'note']);
    expect(p.rows).toEqual([['Smith, Jo', 'said "hi"\nthen left'], ['Ada', 'ok']]);
    expect(p.issues).toEqual([]);
  });
  it('detects delimiters and strips a BOM', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(parseCSV('﻿a,b\n1,2').headers).toEqual(['a', 'b']);
  });
  it('pads short rows, names extra and duplicate columns, reports issues', () => {
    const p = parseCSV('a,a,\n1,2,3,4\n5');
    expect(p.headers).toEqual(['a', 'a (2)', 'Column 3', 'Column 4']);
    expect(p.rows[1]).toEqual(['5', '', '', '']);
    expect(p.issues.length).toBe(2);
    expect(parseCSV('').issues).toEqual(['The file is empty.']);
  });
  it('round-trips through toCSV', () => {
    const rows = [['x, y', 'say "no"'], [' lead', 'multi\nline']];
    const out = toCSV(['a', 'b'], rows);
    expect(parseCSV(out).rows).toEqual(rows);
  });
});
