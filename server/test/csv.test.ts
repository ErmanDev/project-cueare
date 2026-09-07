import { describe, expect, it } from 'vitest';

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
});
