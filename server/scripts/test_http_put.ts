import { issueToken } from '../src/auth/jwt.ts';

async function main() {
  const token = issueToken({ id: 1, username: 'admin', role: 'superadmin' });
  try {
    const res = await fetch('http://127.0.0.1:8080/api/admin/events/2', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Acquaintance Party 2026',
        event_date: '2026-09-25',
        is_active: true,
        fine_template_id: 10,
        session_windows: [
          {
            id: 3,
            session_label: 'Morning Plenary & Team Building',
            start_time: '07:00',
            end_time: '12:00',
            late_after: '07:30',
            in_end: '08:30',
          },
          {
            id: 4,
            session_label: 'Afternoon Socials & Acquaintance Night',
            start_time: '13:00',
            end_time: '17:00',
            late_after: '13:30',
            in_end: '14:30',
          },
        ],
      }),
    });
    console.log('HTTP Status:', res.status);
    const json = await res.json();
    console.log('HTTP Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

main();
