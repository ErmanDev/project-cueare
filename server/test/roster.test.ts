import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

import { mapImportRow, rowsFromSpreadsheet, SAMPLE_DATA_HEADERS } from '../src/students/roster.ts';

describe('mapImportRow', () => {
  it('maps sample_data.xls headers', () => {
    const mapped = mapImportRow({
      StudentID: '02-26-0011',
      FName: 'Shairahh',
      LName: 'Subiera',
      MName: 'Arceno',
      COURSE: 'BSBA',
      YrLevel: '1st Year',
      Sectioning: 'a',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.row).toEqual({
      studentIdCode: '02-26-0011',
      firstName: 'Shairahh',
      middleName: 'Arceno',
      lastName: 'Subiera',
      programCode: 'BSBA',
      yearLevel: 1,
      section: 'A',
      photoUrl: null,
    });
  });

  it('title-cases all-caps and mixed-case names', () => {
    const mapped = mapImportRow({
      StudentID: '02-26-0099',
      FName: 'JUAN',
      LName: 'DELA CRUZ',
      MName: 'mcDonald',
      COURSE: 'BSIT',
      YrLevel: '1st Year',
      Sectioning: 'a',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.row.firstName).toBe('Juan');
    expect(mapped.row.middleName).toBe('Mcdonald');
    expect(mapped.row.lastName).toBe('Dela Cruz');
  });

  it('still accepts the older student_id_code / full_name columns', () => {
    const mapped = mapImportRow({
      student_id_code: 'STU-2026-0001',
      full_name: 'Juan Dela Cruz',
      section: 'BSIT-3A',
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.row.studentIdCode).toBe('STU-2026-0001');
    expect(mapped.row.firstName).toBe('Juan');
    expect(mapped.row.middleName).toBe('Dela');
    expect(mapped.row.lastName).toBe('Cruz');
    expect(mapped.row.section).toBe('BSIT-3A');
  });

  it('rejects rows without StudentID and name parts', () => {
    const mapped = mapImportRow({ FName: 'Ada' });
    expect(mapped.ok).toBe(false);
  });

  it('reads the committed sample spreadsheet', () => {
    const file = path.join(import.meta.dir, '../scripts/sample_data.xls');
    const rows = rowsFromSpreadsheet(readFileSync(file));
    expect(Object.keys(rows[0] ?? [])).toEqual([...SAMPLE_DATA_HEADERS]);
    const mapped = mapImportRow(rows[0] ?? {});
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.row.studentIdCode).toBe('02-26-0011');
    expect(mapped.row.programCode).toBe('BSBA');
    expect(mapped.row.section).toBe('A');
  });
});
