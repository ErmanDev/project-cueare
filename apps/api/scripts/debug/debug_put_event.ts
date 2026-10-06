import { getPool } from '../src/db/pool.ts';
import * as q from '../src/db/queries.ts';
import { withTransaction } from '../src/db/pool.ts';

async function main() {
  const pool = getPool();
  try {
    const updated = await withTransaction(pool, async (client) => {
      const event = await q.updateEvent(client, 2, {
        name: 'Acquaintance Party 2026',
        eventStartDate: new Date(2026, 8, 10),
        eventEndDate: new Date(2026, 8, 10),
        isActive: true,
      });

      const windowsInput = [
        {
          id: 3,
          session_label: 'Morning Plenary & Team Building',
          start_time: '08:00',
          end_time: '12:00',
          late_after: '08:30',
          in_end: '09:30',
        },
        {
          id: 4,
          session_label: 'Afternoon Socials & Acquaintance Night',
          start_time: '13:00',
          end_time: '17:00',
          late_after: '13:30',
          in_end: '14:30',
        },
      ];

      for (const w of windowsInput) {
        await q.updateWindow(client, w.id, {
          sessionLabel: w.session_label,
          startTime: w.start_time,
          endTime: w.end_time,
          lateAfter: w.late_after,
          inEnd: w.in_end,
        });
      }

      return event;
    });
    console.log('Transaction succeeded:', updated);
  } catch (err: any) {
    console.error('Captured Error:', err);
  } finally {
    await pool.end();
  }
}

main();
