import pg from 'pg';
import { getPool } from '../src/db/pool.ts';
import { q } from '../src/db/ident.ts';
import { getEventFinePolicy } from '../src/db/queries.ts';

async function seed() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    console.log('Seeding "Acquaintance Party 2026" event and fine policy rules...\n');

    // Ensure checkout columns are nullable if session does not require checkout
    await client.query(`
      ALTER TABLE ssc."EventSessions" ALTER COLUMN "checkOutOpensAtUtc" DROP NOT NULL;
      ALTER TABLE ssc."EventSessions" ALTER COLUMN "checkOutClosesAtUtc" DROP NOT NULL;
    `);

    // 1. Ensure User
    let userRes = await client.query(`SELECT "userId" FROM ssc."Users" ORDER BY "userId" ASC LIMIT 1`);
    let userId: number;
    if (userRes.rows.length === 0) {
      const newUser = await client.query(`
        INSERT INTO ssc."Users" ("externalSubject", "displayName", "canManageAttendance", "isActive")
        VALUES ('admin_sys', 'System Administrator', TRUE, TRUE)
        RETURNING "userId"
      `);
      userId = newUser.rows[0].userId;
    } else {
      userId = userRes.rows[0].userId;
    }

    // 2. Ensure Academic Year & Term
    let yearRes = await client.query(`SELECT "academicYearId" FROM ssc."AcademicYears" WHERE "yearCode" = '2026-2027'`);
    let yearId: number;
    if (yearRes.rows.length === 0) {
      const ny = await client.query(`
        INSERT INTO ssc."AcademicYears" ("yearCode", "yearName", "startsOn", "endsOn", "isActive")
        VALUES ('2026-2027', 'Academic Year 2026-2027', '2026-08-01', '2027-07-31', TRUE)
        RETURNING "academicYearId"
      `);
      yearId = ny.rows[0].academicYearId;
    } else {
      yearId = yearRes.rows[0].academicYearId;
    }

    let termRes = await client.query(`SELECT "academicTermId" FROM ssc."AcademicTerms" WHERE "termCode" = '2026-1S' AND "academicYearId" = $1`, [yearId]);
    let termId: number;
    if (termRes.rows.length === 0) {
      const nt = await client.query(`
        INSERT INTO ssc."AcademicTerms" ("academicYearId", "termCode", "termName", "startsOn", "endsOn", "isActive")
        VALUES ($1, '2026-1S', '1st Semester 2026-2027', '2026-08-15', '2026-12-20', TRUE)
        RETURNING "academicTermId"
      `, [yearId]);
      termId = nt.rows[0].academicTermId;
    } else {
      termId = termRes.rows[0].academicTermId;
    }

    // 3. Upsert Event
    const eventCode = 'EVT-ACQUAINTANCE-2026';
    const eventName = 'Acquaintance Party 2026';
    const eventDate = '2026-09-25';
    let eventRes = await client.query(`SELECT "eventId" FROM ssc."Events" WHERE "eventCode" = $1`, [eventCode]);
    let eventId: number;
    if (eventRes.rows.length === 0) {
      const ne = await client.query(`
        INSERT INTO ssc."Events" ("academicTermId", "eventCode", "eventName", "eventDate", "eventStatusCode", "createdByUserId")
        VALUES ($1, $2, $3, $4, 'DRAFT', $5)
        RETURNING "eventId"
      `, [termId, eventCode, eventName, eventDate, userId]);
      eventId = ne.rows[0].eventId;
    } else {
      eventId = eventRes.rows[0].eventId;
    }
    console.log(`✓ Event: "${eventName}" [ID: ${eventId}, Code: ${eventCode}]`);

    // 4. Create Sessions (AM & PM)
    const amStarts = new Date('2026-09-25T08:00:00Z');
    const amEnds = new Date('2026-09-25T12:00:00Z');
    const amInOpen = new Date('2026-09-25T07:30:00Z');
    const amInClose = new Date('2026-09-25T09:30:00Z');
    const amLate = new Date('2026-09-25T08:30:00Z');

    let sessAmRes = await client.query(`SELECT "eventSessionId" FROM ssc."EventSessions" WHERE "eventId" = $1 AND "sessionCode" = 'SESS-AM'`, [eventId]);
    let sessAmId: number;
    if (sessAmRes.rows.length === 0) {
      const nsam = await client.query(`
        INSERT INTO ssc."EventSessions" (
          "eventId", "academicTermId", "sessionCode", "sessionName", "sessionTypeCode",
          "startsAtUtc", "endsAtUtc", "checkInOpensAtUtc", "checkInClosesAtUtc", "lateAfterUtc",
          "requiresCheckOut", "minimumMinutes", "isClosed"
        ) VALUES (
          $1, $2, 'SESS-AM', 'Morning Plenary & Team Building', 'AM',
          $3, $4, $5, $6, $7,
          FALSE, 0, FALSE
        ) RETURNING "eventSessionId"
      `, [eventId, termId, amStarts, amEnds, amInOpen, amInClose, amLate]);
      sessAmId = nsam.rows[0].eventSessionId;
    } else {
      sessAmId = sessAmRes.rows[0].eventSessionId;
    }

    const pmStarts = new Date('2026-09-25T13:00:00Z');
    const pmEnds = new Date('2026-09-25T19:00:00Z');
    const pmInOpen = new Date('2026-09-25T12:30:00Z');
    const pmInClose = new Date('2026-09-25T14:30:00Z');
    const pmLate = new Date('2026-09-25T13:30:00Z');
    const pmOutOpen = new Date('2026-09-25T17:30:00Z');
    const pmOutClose = new Date('2026-09-25T19:30:00Z');

    let sessPmRes = await client.query(`SELECT "eventSessionId" FROM ssc."EventSessions" WHERE "eventId" = $1 AND "sessionCode" = 'SESS-PM'`, [eventId]);
    let sessPmId: number;
    if (sessPmRes.rows.length === 0) {
      const nspm = await client.query(`
        INSERT INTO ssc."EventSessions" (
          "eventId", "academicTermId", "sessionCode", "sessionName", "sessionTypeCode",
          "startsAtUtc", "endsAtUtc", "checkInOpensAtUtc", "checkInClosesAtUtc", "lateAfterUtc",
          "checkOutOpensAtUtc", "checkOutClosesAtUtc", "requiresCheckOut", "minimumMinutes", "isClosed"
        ) VALUES (
          $1, $2, 'SESS-PM', 'Afternoon Socials & Acquaintance Night', 'PM',
          $3, $4, $5, $6, $7,
          $8, $9, TRUE, 60, FALSE
        ) RETURNING "eventSessionId"
      `, [eventId, termId, pmStarts, pmEnds, pmInOpen, pmInClose, pmLate, pmOutOpen, pmOutClose]);
      sessPmId = nspm.rows[0].eventSessionId;
    } else {
      sessPmId = sessPmRes.rows[0].eventSessionId;
    }

    console.log(`✓ Session 1 (AM): "Morning Plenary & Team Building" [ID: ${sessAmId}]`);
    console.log(`✓ Session 2 (PM): "Afternoon Socials & Acquaintance Night" [ID: ${sessPmId}]`);

    // 5. Look up STANDARD_SCHOOL_EVENT template version
    const tplVerRes = await client.query(`
      SELECT v."finePolicyTemplateVersionId"
      FROM ssc."FinePolicyTemplateVersions" v
      JOIN ssc."FinePolicyTemplates" t ON t."finePolicyTemplateId" = v."finePolicyTemplateId"
      WHERE t."templateCode" = 'STANDARD_SCHOOL_EVENT' AND v."versionStatusCode" = 'PUBLISHED'
      ORDER BY v."versionNumber" DESC LIMIT 1
    `);
    const templateVersionId = tplVerRes.rows[0]?.finePolicyTemplateVersionId;

    // 6. Bind Fine Policy to Event
    const policyCode = 'FP-ACQUAINTANCE-2026';
    const policyName = 'Acquaintance Party 2026 Fine Policy';
    let policyRes = await client.query(`SELECT "eventFinePolicyId" FROM ssc."EventFinePolicies" WHERE "eventId" = $1`, [eventId]);
    let policyId: number;

    if (policyRes.rows.length === 0) {
      if (templateVersionId) {
        const createRes = await client.query(`
          SELECT sp_event_fine_policy_create_from_template($1, $2, $3, $4, $5) AS policy_id
        `, [eventId, templateVersionId, policyCode, policyName, userId]);
        policyId = createRes.rows[0].policy_id;
      } else {
        const np = await client.query(`
          INSERT INTO ssc."EventFinePolicies" ("eventId", "policyCode", "policyName", "currencyCode", "maximumFinePerStudent", "createdByUserId")
          VALUES ($1, $2, $3, 'PHP', 500.00, $4)
          RETURNING "eventFinePolicyId"
        `, [eventId, policyCode, policyName, userId]);
        policyId = np.rows[0].eventFinePolicyId;
      }
    } else {
      policyId = policyRes.rows[0].eventFinePolicyId;
    }
    console.log(`✓ Event Fine Policy: "${policyName}" [ID: ${policyId}]`);

    // 7. Insert or update fine rules for AM & PM sessions
    const rulesToSeed = [
      { sessionId: sessAmId, violation: 'ABSENT', amount: 100.0, priority: 100 },
      { sessionId: sessAmId, violation: 'LATE', amount: 50.0, priority: 100 },
      { sessionId: sessPmId, violation: 'ABSENT', amount: 150.0, priority: 100 },
      { sessionId: sessPmId, violation: 'LATE', amount: 75.0, priority: 100 },
    ];

    for (const r of rulesToSeed) {
      await client.query(`
        INSERT INTO ssc."EventFineRules" (
          "eventFinePolicyId", "eventId", "eventSessionId", "violationCode", "fineAmount", "priorityOrder", "isActive"
        ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
        ON CONFLICT ("eventFinePolicyId", "eventSessionId", "violationCode")
        DO UPDATE SET "fineAmount" = EXCLUDED."fineAmount", "priorityOrder" = EXCLUDED."priorityOrder", "isActive" = TRUE
      `, [policyId, eventId, r.sessionId, r.violation, r.amount, r.priority]);
    }

    console.log('\n--- Effective Event Fine Policy Matrix ---');
    const policyDetails = await getEventFinePolicy(client, eventId);
    console.log(JSON.stringify(policyDetails, null, 2));

    console.log('\n>>> "Acquaintance Party 2026" event and fine rules seeded successfully! <<<');
  } catch (err: any) {
    console.error('Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
