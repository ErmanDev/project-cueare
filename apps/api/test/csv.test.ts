import { describe, expect, it } from 'bun:test';

import { encodeCsv, parseCsv } from '../src/utils/csv.ts';

describe('CsvUtils', () => {
  it('parses quoted commas and drops blank rows', () => {
    const rows = parseCsv('a,b\n"c,d",e\n\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['c,d', 'e'],
    ]);
  });

  it('encodes fields that need quotes', () => {
    expect(encodeCsv([['a', 'b,c', 'he said "hi"']])).toContain('"b,c"');
  });

  it('parses tab-separated rows pasted from Excel', () => {
    const rows = parseCsv('StudentID\tFName\tLName\n02-26-0011\tAda\tLovelace', '\t');
    expect(rows).toEqual([
      ['StudentID', 'FName', 'LName'],
      ['02-26-0011', 'Ada', 'Lovelace'],
    ]);
  });
});
