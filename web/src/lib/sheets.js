// Read Excel (.xlsx) and CSV files on the device — for filling forms with AI and importing
// tables (shock dyno readings, gear charts). The Excel reader loads only when first needed.
export const SHEET_ACCEPT = '.xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv';
export const isSheet = (f) => /\.(xlsx|csv|tsv|txt)$/i.test(f?.name || '') || /spreadsheetml|text\/(csv|tab|plain)/.test(f?.type || '');

function splitDelimited(text) {
  const delim = text.includes('\t') ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** → [{ name, rows: string[][] }] */
export async function readSpreadsheet(file) {
  if (/\.xls$/i.test(file.name)) throw new Error(`${file.name} is an old .xls file — save it as .xlsx or CSV first.`);
  if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is over 5 MB.`);
  if (/\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type)) {
    const { default: readXlsx, readSheetNames } = await import('read-excel-file');
    const names = await readSheetNames(file);
    const out = [];
    for (const [i, name] of names.slice(0, 10).entries()) {
      const rows = await readXlsx(file, { sheet: i + 1 });
      out.push({ name, rows: rows.map((r) => r.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)))).filter((r) => r.some((c) => c.trim() !== '')) });
    }
    return out;
  }
  return [{ name: file.name, rows: splitDelimited(await file.text()) }];
}

export const sheetToText = (sheet) => sheet.rows.map((r) => r.join('\t')).join('\n');
