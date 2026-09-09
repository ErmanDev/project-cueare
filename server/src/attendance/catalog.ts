import type { Pool } from 'pg';

import { BatchLoader } from '../infra/batchLoader.ts';
import { TtlCache } from '../infra/ttlCache.ts';
import type { RuntimeTuning } from '../config.ts';
import * as q from '../db/queries.ts';
import type { EventRow, SessionWindowRow, StudentRow } from '../types.ts';

const MISS_TTL_MS = 5_000;

export class AttendanceCatalog {
  private readonly cache: TtlCache<unknown>;
  private readonly studentByCode: BatchLoader<string, StudentRow | null>;
  private readonly ttl: RuntimeTuning;

  constructor(
    private readonly pool: Pool,
    ttl: RuntimeTuning,
  ) {
    this.ttl = ttl;
    this.cache = new TtlCache({
      ttlMs: ttl.cacheTtlMs,
      maxSize: ttl.cacheMaxEntries,
    });
    this.studentByCode = new BatchLoader(
      async (codes) => {
        const rows = await q.getStudentsByCodes(this.pool, codes);
        const byCode = new Map(rows.map((s) => [s.student_id_code, s]));
        const out = new Map<string, StudentRow | null>();
        for (const code of codes) out.set(code, byCode.get(code) ?? null);
        return out;
      },
      { windowMs: ttl.batchWindowMs, maxBatch: ttl.batchMax },
    );
  }

  getStudentByCode(code: string): Promise<StudentRow | null> {
    const key = `stu:code:${code}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return Promise.resolve(hit as StudentRow | null);
    return this.studentByCode.load(code).then((row) => {
      this.cache.set(key, row, row ? this.ttl.cacheTtlMs : MISS_TTL_MS);
      if (row) this.cache.set(`stu:id:${row.id}`, row, this.ttl.cacheTtlMs);
      return row;
    });
  }

  getStudentById(id: number): Promise<StudentRow | null> {
    return this.cache.getOrLoad(
      `stu:id:${id}`,
      () => q.getStudentById(this.pool, id),
      this.ttl.cacheTtlMs,
    ) as Promise<StudentRow | null>;
  }

  getEventById(id: number): Promise<EventRow | null> {
    return this.cache.getOrLoad(
      `event:${id}`,
      () => q.getEventById(this.pool, id),
      this.ttl.eventTtlMs,
    ) as Promise<EventRow | null>;
  }

  windowsForEvent(eventId: number): Promise<SessionWindowRow[]> {
    return this.cache.getOrLoad(
      `windows:${eventId}`,
      () => q.windowsForEvent(this.pool, eventId),
      this.ttl.eventTtlMs,
    ) as Promise<SessionWindowRow[]>;
  }

  getWindowById(id: number): Promise<SessionWindowRow | null> {
    return this.cache.getOrLoad(
      `window:${id}`,
      () => q.getWindowById(this.pool, id),
      this.ttl.eventTtlMs,
    ) as Promise<SessionWindowRow | null>;
  }

  listActiveEvents(): Promise<EventRow[]> {
    return this.cache.getOrLoad(
      'events:active',
      () => q.listActiveEvents(this.pool),
      this.ttl.eventTtlMs,
    ) as Promise<EventRow[]>;
  }

  listAllWindows(): Promise<SessionWindowRow[]> {
    return this.cache.getOrLoad(
      'windows:all',
      () => q.listAllWindows(this.pool),
      this.ttl.eventTtlMs,
    ) as Promise<SessionWindowRow[]>;
  }

  rememberStudent(student: StudentRow): void {
    this.cache.set(`stu:id:${student.id}`, student, this.ttl.cacheTtlMs);
    this.cache.set(`stu:code:${student.student_id_code}`, student, this.ttl.cacheTtlMs);
  }

  invalidateStudent(student: { id: number; student_id_code: string }): void {
    this.cache.delete(`stu:id:${student.id}`);
    this.cache.delete(`stu:code:${student.student_id_code}`);
  }

  invalidateAllStudents(): void {
    this.cache.deletePrefix('stu:');
  }

  invalidateEvent(eventId?: number): void {
    if (eventId != null) {
      this.cache.delete(`event:${eventId}`);
      this.cache.delete(`windows:${eventId}`);
    } else {
      this.cache.deletePrefix('event:');
      this.cache.deletePrefix('windows:');
    }
    this.cache.delete('events:active');
    this.cache.delete('windows:all');
    this.cache.deletePrefix('window:');
  }

  clear(): void {
    this.cache.clear();
  }
}
