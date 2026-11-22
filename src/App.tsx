import { useMemo, useRef, useState } from 'react';
import { DemoTag, downloadText, EmptyState, Landing, NotFound, Notice, PageHead, readFileText, Shell, useFlash, usePersistentState, useRoute } from './shared/ui';
import { applyOps, DEFAULT_OPS, detect, visualise, type CaseMode, type Ops } from './lib/clean';
import { DELIMITER_NAME, parseCSV, toCSV } from './lib/csv';
import { DEMO_CSV } from './lib/demo';

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/clean', label: 'Clean a file' },
  { to: '/rules', label: 'What each fix does' },
];
const MAX_BYTES = 5 * 1024 * 1024;

export default function App() {
  const [route] = useRoute();
  let page;
  if (route === '/') page = <Home />;
  else if (route === '/clean') page = <Clean />;
  else if (route === '/rules') page = <Rules />;
  else page = <NotFound />;
  return (
    <Shell name="CleanSheet" wordmark={['Clean', 'Sheet']} nav={NAV} route={route} cta={{ to: '/clean', label: 'Clean a CSV' }} footerNote="Files stay in your browser. The original is never modified.">
      {page}
    </Shell>
  );
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  if (before === after) return <span>{after}</span>;
  return (
    <span className="ba">
      <del>{visualise(before) || '∅'}</del>
      <ins>{after || '∅'}</ins>
    </span>
  );
}

function Home() {
  const p = parseCSV(DEMO_CSV);
  const res = applyOps(p.headers, p.rows, DEFAULT_OPS);
  const examples = [...res.changedCells.entries()].slice(0, 4);
  return (
    <Landing
      compact
      eyebrow="CSV cleaning · preview before you export"
      title={<>Tidy a messy spreadsheet <em>without touching the original.</em></>}
      lead="Upload a CSV and CleanSheet finds stray spaces, duplicate rows, empty rows and placeholder values like “NA”. Pick the fixes you want, check every change in a before/after preview, then download a clean copy."
      primary={{ href: '#/clean', label: 'Clean a CSV' }}
      secondary={{ href: '#/rules', label: 'What each fix does' }}
      previewLabel="Demo customer list · real preview output"
      meta={['No upload', 'Original untouched', 'Demo file included']}
      preview={
        <div className="hero-clean">
          <div className="hc-counts">
            <div><strong>{res.cellChanges}</strong><span className="label-mono">cells fixed</span></div>
            <div><strong>{res.removed.length}</strong><span className="label-mono">rows removed</span></div>
            <div><strong>{res.rows.length}</strong><span className="label-mono">rows kept</span></div>
          </div>
          <table className="table compact">
            <tbody>
              {examples.map(([ri, cols]) => [...cols].slice(0, 1).map((ci) => (
                <tr key={`${ri}-${ci}`}><td className="mono small muted">{p.headers[ci]}</td><td><BeforeAfter before={p.rows[ri][ci]} after={res.rows[res.sourceIndex.indexOf(ri)][ci]} /></td></tr>
              )))}
              {res.removed.slice(0, 2).map((r) => <tr key={r.index}><td className="mono small muted">row {r.index + 2}</td><td><span className="badge badge-err">{r.reason}</span></td></tr>)}
            </tbody>
          </table>
        </div>
      }
      steps={[
        { title: 'Load the file', body: 'Upload a CSV up to 5 MB or paste it. The delimiter is detected automatically.' },
        { title: 'Choose fixes', body: 'Trim spaces, remove duplicates (exact, loose or by key columns), blank “NA”, fix case, drop columns.' },
        { title: 'Check & export', body: 'Every changed cell and removed row is shown. Download only when it looks right.' },
      ]}
      features={[
        { title: 'Issue scan', body: 'Counts leading/trailing spaces, double spaces, non-breaking spaces, placeholders, empty and duplicate rows.' },
        { title: 'Before / after', body: 'Changed cells show the old value struck through — invisible spaces made visible as ·.' },
        { title: 'Smart duplicates', body: 'Match exact rows, rows that differ only by case or spacing, or rows sharing key columns like email.' },
        { title: 'Excel-friendly export', body: 'Choose comma, semicolon or tab, and optionally add a byte-order mark so Excel reads accents correctly.' },
      ]}
      note="CleanSheet never edits your file in place and keeps the first occurrence when removing duplicates. Review the preview — automated cleaning can remove rows you wanted."
      closing={{ title: <>Clean your <em>next export.</em></>, action: { href: '#/clean', label: 'Clean a CSV' } }}
    />
  );
}

const PAGE = 20;

function Clean() {
  const [text, setText] = usePersistentState('cleansheet:csv', DEMO_CSV);
  const [name, setName] = usePersistentState('cleansheet:name', 'demo-customers.csv');
  const [ops, setOps] = usePersistentState<Ops>('cleansheet:ops', DEFAULT_OPS);
  const [tab, setTab] = useState<'changed' | 'removed' | 'result'>('changed');
  const [delimiter, setDelimiter] = useState(',');
  const [bom, setBom] = useState(false);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [paste, setPaste] = useState('');
  const [flash, setFlash] = useFlash(6000);
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseCSV(text), [text]);
  const found = useMemo(() => detect(parsed.rows), [parsed]);
  const result = useMemo(() => applyOps(parsed.headers, parsed.rows, ops), [parsed, ops]);
  const set = (patch: Partial<Ops>) => { setOps({ ...ops, ...patch }); setPage(0); };
  const changedRows = [...result.changedCells.keys()].sort((a, b) => a - b);
  const keyMissing = ops.dedupe === 'key' && ops.keyColumns.length === 0;
  const fileOut = name.replace(/\.(csv|tsv|txt)$/i, '') + '-clean.csv';

  async function onFile(f?: File) {
    if (!f) return;
    if (f.size > MAX_BYTES) return setFlash({ kind: 'error', text: `${f.name} is over 5 MB.` });
    setLoading(true);
    try {
      const t = await readFileText(f);
      const p = parseCSV(t);
      if (!p.rows.length) throw new Error();
      setText(t);
      setName(f.name);
      setOps({ ...DEFAULT_OPS });
      setFlash({ kind: 'success', text: `Loaded ${f.name} (${p.rows.length.toLocaleString()} rows, ${DELIMITER_NAME[p.delimiter] ?? 'custom'}-separated).` });
    } catch {
      setFlash({ kind: 'error', text: `${f.name} has no data rows or isn’t a text CSV.` });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  function download() {
    if (result.rows.length === 0) return setFlash({ kind: 'error', text: 'The cleaned file would be empty — check your options.' });
    downloadText(fileOut, (bom ? '﻿' : '') + toCSV(result.headers, result.rows, delimiter), 'text/csv');
    setFlash({ kind: 'success', text: `Downloaded ${fileOut}: ${result.rows.length} rows × ${result.headers.length} columns. Your original file is unchanged.` });
  }

  const issueCards: [string, number, string][] = [
    ['Extra spaces at start/end', found.leadingTrailing, 'cells'],
    ['Double spaces inside', found.doubleSpaces, 'cells'],
    ['Non-breaking spaces', found.nbsp, 'cells'],
    ['Placeholders (NA, null, -)', found.missingMarkers, 'cells'],
    ['Empty rows', found.emptyRows, 'rows'],
    ['Exact duplicates', found.exactDuplicates, 'rows'],
    ['Near duplicates (case/spacing)', found.caseDuplicates, 'rows'],
  ];

  return (
    <div className="stack">
      <PageHead
        eyebrow={<>Workspace · Clean {text === DEMO_CSV && <DemoTag />}</>}
        title={<em>{name}</em>}
        description={text ? `${parsed.rows.length} rows × ${parsed.headers.length} columns → ${result.rows.length} rows × ${result.headers.length} columns after cleaning` : 'No file loaded'}
        actions={
          <>
            <input ref={fileRef} id="csv-file" type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            <label htmlFor="csv-file" className="btn">{loading ? <><span className="spinner" aria-hidden="true" /> Reading…</> : 'Upload CSV'}</label>
            {text !== DEMO_CSV && <button type="button" className="btn" onClick={() => { setText(DEMO_CSV); setName('demo-customers.csv'); setOps(DEFAULT_OPS); }}>Load demo</button>}
            {text && <button type="button" className="btn btn-ghost" onClick={() => setText('')}>Clear</button>}
          </>
        }
      />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {!text ? (
        <div className="stack">
          <EmptyState title="Load a CSV to start" actions={<button type="button" className="btn btn-primary" onClick={() => { setText(DEMO_CSV); setName('demo-customers.csv'); }}>Use the demo file</button>}>Upload a file above, paste below, or try the messy demo customer list.</EmptyState>
          <div className="card stack">
            <label htmlFor="paste" className="label">Paste CSV text</label>
            <textarea id="paste" className="code" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button type="button" className="btn" onClick={() => { if (!parseCSV(paste).rows.length) return setFlash({ kind: 'error', text: 'Paste a header row and at least one data row.' }); setText(paste); setName('pasted.csv'); setPaste(''); }}>Use pasted text</button>
          </div>
        </div>
      ) : (
        <>
          <section aria-labelledby="found-title">
            <h2 id="found-title" className="step-title"><span>1</span> What we found</h2>
            <div className="issue-grid">
              {issueCards.map(([label, n, unit]) => (
                <div key={label} className={`issue ${n ? 'has' : ''}`}>
                  <strong>{n}</strong>
                  <span>{label}</span>
                  <span className="hint">{n ? unit : 'none found'}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="clean-grid">
            <section className="card stack ops" aria-labelledby="ops-title">
              <h2 id="ops-title" className="step-title"><span>2</span> Choose fixes</h2>
              <fieldset>
                <legend className="label">Spaces &amp; placeholders</legend>
                <label className="check"><input type="checkbox" checked={ops.trim} onChange={(e) => set({ trim: e.target.checked })} /> Trim spaces at the start and end of cells</label>
                <label className="check"><input type="checkbox" checked={ops.collapseSpaces} onChange={(e) => set({ collapseSpaces: e.target.checked })} /> Collapse double spaces inside cells</label>
                <label className="check"><input type="checkbox" checked={ops.nbsp} onChange={(e) => set({ nbsp: e.target.checked })} /> Replace non-breaking spaces</label>
                <label className="check"><input type="checkbox" checked={ops.blankMarkers} onChange={(e) => set({ blankMarkers: e.target.checked })} /> Blank out NA, null, none and “-”</label>
              </fieldset>
              <fieldset>
                <legend className="label">Rows</legend>
                <label className="check"><input type="checkbox" checked={ops.removeEmptyRows} onChange={(e) => set({ removeEmptyRows: e.target.checked })} /> Remove empty rows</label>
                <div className="radio-group" role="radiogroup" aria-label="Duplicate rows">
                  {([['none', 'Keep duplicates'], ['exact', 'Remove exact duplicates'], ['loose', 'Ignore case & spacing'], ['key', 'Match on key columns']] as const).map(([v, l]) => (
                    <label key={v} className="check"><input type="radio" name="dedupe" checked={ops.dedupe === v} onChange={() => set({ dedupe: v })} /> {l}</label>
                  ))}
                </div>
                {ops.dedupe === 'key' && (
                  <div className="key-cols">
                    <span className="hint">Rows with the same values in these columns are duplicates (first kept):</span>
                    <div className="chips">
                      {parsed.headers.map((h, i) => (
                        <label key={h} className={`chip ${ops.keyColumns.includes(i) ? 'on' : ''}`}>
                          <input type="checkbox" checked={ops.keyColumns.includes(i)} onChange={() => set({ keyColumns: ops.keyColumns.includes(i) ? ops.keyColumns.filter((k) => k !== i) : [...ops.keyColumns, i] })} /> {h}
                        </label>
                      ))}
                    </div>
                    {keyMissing && <span className="error-text">Pick at least one key column, or no duplicates will be removed.</span>}
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend className="label">Columns</legend>
                <div className="col-ops">
                  {parsed.headers.map((h, i) => (
                    <div key={h} className="col-op">
                      <code>{h}</code>
                      <select aria-label={`Letter case for ${h}`} value={ops.caseColumns[i] ?? 'none'} onChange={(e) => set({ caseColumns: { ...ops.caseColumns, [i]: e.target.value as CaseMode } })}>
                        <option value="none">Keep case</option>
                        <option value="lower">lowercase</option>
                        <option value="upper">UPPERCASE</option>
                        <option value="title">Title Case</option>
                      </select>
                      <label className="check small"><input type="checkbox" checked={ops.dropColumns.includes(i)} onChange={() => set({ dropColumns: ops.dropColumns.includes(i) ? ops.dropColumns.filter((c) => c !== i) : [...ops.dropColumns, i] })} aria-label={`Drop column ${h}`} /> Drop</label>
                    </div>
                  ))}
                </div>
              </fieldset>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOps(DEFAULT_OPS)}>Reset to recommended</button>
            </section>
            <div className="stack">
              <section className="card" aria-labelledby="prev-title">
                <h2 id="prev-title" className="step-title"><span>3</span> Preview changes</h2>
                <div className="tabs" role="tablist">
                  <button type="button" role="tab" aria-selected={tab === 'changed'} onClick={() => { setTab('changed'); setPage(0); }}>Changed cells ({result.cellChanges})</button>
                  <button type="button" role="tab" aria-selected={tab === 'removed'} onClick={() => setTab('removed')}>Removed rows ({result.removed.length})</button>
                  <button type="button" role="tab" aria-selected={tab === 'result'} onClick={() => { setTab('result'); setPage(0); }}>Cleaned data</button>
                </div>
                {tab === 'changed' && (changedRows.length === 0 ? <p className="muted">No cells change with these options.</p> : (
                  <div className="table-wrap">
                    <table className="table ba-table">
                      <thead><tr><th className="num">Row</th>{parsed.headers.map((h, i) => !ops.dropColumns.includes(i) && <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>
                        {changedRows.slice(page * PAGE, page * PAGE + PAGE).map((ri) => {
                          const out = result.rows[result.sourceIndex.indexOf(ri)];
                          const keptCols = parsed.headers.map((_, i) => i).filter((i) => !ops.dropColumns.includes(i));
                          return (
                            <tr key={ri}>
                              <td className="num muted">{ri + 2}</td>
                              {keptCols.map((ci, k) => <td key={ci} className={result.changedCells.get(ri)!.has(ci) ? 'changed' : ''}><BeforeAfter before={parsed.rows[ri][ci]} after={out[k]} /></td>)}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
                {tab === 'removed' && (result.removed.length === 0 ? <p className="muted">No rows are removed with these options.</p> : (
                  <ul className="list removed">
                    {result.removed.map((r) => (
                      <li key={r.index}><span className="badge badge-err">Row {r.index + 2}</span> <span className="small">{r.reason}</span> <code className="small muted">{r.row.join(', ') || '(empty)'}</code></li>
                    ))}
                  </ul>
                ))}
                {tab === 'result' && (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr>{result.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                      <tbody>{result.rows.slice(page * PAGE, page * PAGE + PAGE).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                {tab !== 'removed' && Math.ceil((tab === 'changed' ? changedRows.length : result.rows.length) / PAGE) > 1 && (
                  <nav className="row pager" aria-label="Preview pages">
                    <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>← Previous</button>
                    <button type="button" className="btn btn-sm" disabled={(page + 1) * PAGE >= (tab === 'changed' ? changedRows.length : result.rows.length)} onClick={() => setPage(page + 1)}>Next →</button>
                  </nav>
                )}
                <p className="hint legend-ba"><del>old</del> → <ins>new</ins> · “·” marks a space that will be removed, “⍽” a non-breaking space, “∅” an empty cell. Row numbers match the spreadsheet (header = row 1).</p>
              </section>
              <section className="card stack export" aria-labelledby="exp-title">
                <h2 id="exp-title" className="step-title"><span>4</span> Export</h2>
                <ul className="log">{result.log.length ? result.log.map((l) => <li key={l}>{l}</li>) : <li>No changes — the export will match the original.</li>}</ul>
                <div className="row">
                  <label className="field inline-field">
                    <span className="label">Delimiter</span>
                    <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
                      <option value=",">Comma</option>
                      <option value=";">Semicolon</option>
                      <option value={'\t'}>Tab</option>
                    </select>
                  </label>
                  <label className="check"><input type="checkbox" checked={bom} onChange={(e) => setBom(e.target.checked)} /> Add BOM (helps Excel with accents)</label>
                </div>
                <button type="button" className="btn btn-primary btn-lg" onClick={download}>Download {fileOut}</button>
                <p className="hint">The original file is never modified. The download is a new file.</p>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Rules() {
  return (
    <div className="stack narrow">
      <PageHead eyebrow="Reference" title={<>What each fix <em>does</em></>} description="Fixes run in this order on every cell, then rows are filtered." />
      <div className="card prose">
        <ol>
          <li><strong>Replace non-breaking spaces</strong> (U+00A0, common when copying from web pages) with normal spaces.</li>
          <li><strong>Trim</strong> spaces, tabs and line breaks at the start and end of each cell.</li>
          <li><strong>Collapse double spaces</strong> between words into one.</li>
          <li><strong>Blank placeholders</strong>: NA, N/A, null, none, NaN, - and — become empty cells (off by default, because “-” can be meaningful).</li>
          <li><strong>Letter case</strong> per column: lowercase (good for emails), UPPERCASE (codes), Title Case (names; handles O’Brien and hyphens).</li>
        </ol>
        <h2>Rows</h2>
        <p><strong>Empty rows</strong> are rows where every cell is blank after cleaning. <strong>Duplicates</strong> keep the first occurrence and remove later ones:</p>
        <ul>
          <li><em>Exact</em> — identical after the cell fixes above.</li>
          <li><em>Ignore case &amp; spacing</em> — “Ada ” and “ada” match.</li>
          <li><em>Key columns</em> — rows that share values in the chosen columns (e.g. email) match, even if other columns differ.</li>
        </ul>
        <h2>Export</h2>
        <p>Values containing the delimiter, quotes, line breaks or edge spaces are quoted following RFC 4180. Line endings are CRLF for maximum compatibility.</p>
      </div>
    </div>
  );
}
