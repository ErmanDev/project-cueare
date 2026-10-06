export function detectDelimiter(input: string): ',' | '\t' {
  const first = input.split(/\r?\n/, 1)[0] ?? '';
  const tabs = (first.match(/\t/g) ?? []).length;
  const commas = (first.match(/,/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

export function parseCsv(input: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < input.length && input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // ignore — handled by \n
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function escapeCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function encodeCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\n') + (rows.length ? '\n' : '');
}
