export interface Detection {
  leadingTrailing: number;
  doubleSpaces: number;
  nbsp: number;
  missingMarkers: number;
  emptyRows: number;
  exactDuplicates: number;
  caseDuplicates: number; // duplicates only when ignoring case/whitespace (excludes exact ones)
}

const MARKERS = new Set(['na', 'n/a', 'null', 'none', 'nan', '-', '—']);

export function detect(rows: string[][]): Detection {
  const d: Detection = { leadingTrailing: 0, doubleSpaces: 0, nbsp: 0, missingMarkers: 0, emptyRows: 0, exactDuplicates: 0, caseDuplicates: 0 };
  const exact = new Set<string>();
  const loose = new Set<string>();
  for (const r of rows) {
    if (r.every((c) => c.trim() === '')) d.emptyRows++;
    for (const c of r) {
      if (c !== c.trim()) d.leadingTrailing++;
      if (/\S {2,}\S/.test(c)) d.doubleSpaces++;
      if (c.includes(' ')) d.nbsp++;
      if (MARKERS.has(c.trim().toLowerCase())) d.missingMarkers++;
    }
    const ek = JSON.stringify(r);
    const lk = JSON.stringify(r.map(normalise));
    if (exact.has(ek)) d.exactDuplicates++;
    else if (loose.has(lk)) d.caseDuplicates++;
    exact.add(ek);
    loose.add(lk);
  }
  return d;
}

export function normalise(v: string): string {
  return v.replace(/ /g, ' ').trim().replace(/\s+/g, ' ').toLowerCase();
}

export type CaseMode = 'none' | 'lower' | 'upper' | 'title';

export interface Ops {
  trim: boolean;
  collapseSpaces: boolean;
  nbsp: boolean;
  blankMarkers: boolean;
  removeEmptyRows: boolean;
  dedupe: 'none' | 'exact' | 'loose' | 'key';
  keyColumns: number[];
  caseColumns: Record<number, CaseMode>;
  dropColumns: number[];
}

export const DEFAULT_OPS: Ops = { trim: true, collapseSpaces: true, nbsp: true, blankMarkers: false, removeEmptyRows: true, dedupe: 'exact', keyColumns: [], caseColumns: {}, dropColumns: [] };

export interface Removed {
  index: number; // original row index
  reason: string;
  row: string[];
}

export interface Result {
  headers: string[];
  rows: string[][];
  sourceIndex: number[]; // original index of each kept row
  changedCells: Map<number, Set<number>>; // original row index -> changed column indices (original numbering)
  removed: Removed[];
  cellChanges: number;
  log: string[];
}

const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

export function cleanCell(v: string, col: number, ops: Ops): string {
  let s = v;
  if (ops.nbsp) s = s.replace(/ /g, ' ');
  if (ops.trim) s = s.trim();
  if (ops.collapseSpaces) s = s.replace(/(\S) {2,}(?=\S)/g, '$1 ');
  if (ops.blankMarkers && MARKERS.has(s.trim().toLowerCase())) s = '';
  const mode = ops.caseColumns[col] ?? 'none';
  if (mode === 'lower') s = s.toLowerCase();
  else if (mode === 'upper') s = s.toUpperCase();
  else if (mode === 'title') s = title(s);
  return s;
}

export function applyOps(headers: string[], rows: string[][], ops: Ops): Result {
  const changedCells = new Map<number, Set<number>>();
  const removed: Removed[] = [];
  let cellChanges = 0;
  const cleaned = rows.map((r, ri) =>
    r.map((v, ci) => {
      const out = cleanCell(v, ci, ops);
      if (out !== v && !ops.dropColumns.includes(ci)) {
        if (!changedCells.has(ri)) changedCells.set(ri, new Set());
        changedCells.get(ri)!.add(ci);
        cellChanges++;
      }
      return out;
    }),
  );
  const keep: number[] = [];
  const seen = new Map<string, number>();
  cleaned.forEach((r, ri) => {
    if (ops.removeEmptyRows && r.every((c) => c.trim() === '')) {
      removed.push({ index: ri, reason: 'Empty row', row: rows[ri] });
      return;
    }
    if (ops.dedupe !== 'none') {
      const key =
        ops.dedupe === 'exact' ? JSON.stringify(r) : ops.dedupe === 'loose' ? JSON.stringify(r.map(normalise)) : JSON.stringify(ops.keyColumns.map((k) => normalise(r[k] ?? '')));
      if (ops.dedupe === 'key' && ops.keyColumns.length === 0) {
        keep.push(ri);
        return;
      }
      if (seen.has(key)) {
        removed.push({ index: ri, reason: `Duplicate of row ${seen.get(key)! + 2}`, row: rows[ri] });
        return;
      }
      seen.set(key, ri);
    }
    keep.push(ri);
  });
  // A changed cell on a removed row isn't a change in the output.
  for (const r of removed) {
    cellChanges -= changedCells.get(r.index)?.size ?? 0;
    changedCells.delete(r.index);
  }
  const keepCols = headers.map((_, i) => i).filter((i) => !ops.dropColumns.includes(i));
  const log: string[] = [];
  if (cellChanges) log.push(`Changed ${cellChanges} cell${cellChanges === 1 ? '' : 's'} (${[ops.trim && 'trimmed spaces', ops.collapseSpaces && 'collapsed double spaces', ops.nbsp && 'replaced non-breaking spaces', ops.blankMarkers && 'blanked missing markers', Object.values(ops.caseColumns).some((m) => m !== 'none') && 'normalised letter case'].filter(Boolean).join(', ')}).`);
  const dupes = removed.filter((r) => r.reason.startsWith('Duplicate')).length;
  const empties = removed.length - dupes;
  if (dupes) log.push(`Removed ${dupes} duplicate row${dupes === 1 ? '' : 's'} (${ops.dedupe === 'key' ? `matching on ${ops.keyColumns.map((k) => headers[k]).join(', ')}` : ops.dedupe === 'loose' ? 'ignoring case and spacing' : 'exact matches'}).`);
  if (empties) log.push(`Removed ${empties} empty row${empties === 1 ? '' : 's'}.`);
  if (ops.dropColumns.length) log.push(`Dropped column${ops.dropColumns.length === 1 ? '' : 's'}: ${ops.dropColumns.map((c) => headers[c]).join(', ')}.`);
  return {
    headers: keepCols.map((i) => headers[i]),
    rows: keep.map((ri) => keepCols.map((ci) => cleaned[ri][ci])),
    sourceIndex: keep,
    changedCells,
    removed,
    cellChanges,
    log,
  };
}

/** Shows invisible characters so changes are visible in the preview. */
export function visualise(v: string): string {
  return v.replace(/ /g, '⍽').replace(/^ +| +$/g, (m) => '·'.repeat(m.length)).replace(/ {2,}/g, (m) => '·'.repeat(m.length));
}
