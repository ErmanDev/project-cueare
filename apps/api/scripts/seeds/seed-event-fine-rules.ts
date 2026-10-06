import { getPool } from '../src/db/pool.ts';
import { getEventFinePolicy } from '../src/db/queries.ts';

interface EventRow {
  eventId: number;
  academicTermId: number;
  eventCode: string;
  eventName: string;
  eventDate: string | Date;
  eventStatusCode: string;
}

interface SessionRow {
  eventSessionId: number;
  eventId: number;
  sessionCode: string;
  sessionName: string;
  sessionTypeCode: string;
  requiresCheckOut: boolean;
}

interface TemplateRuleRow {
  templateCode: string;
  finePolicyTemplateVersionId: number;
  sessionTypeCode: string;
  violationCode: string;
  fineAmount: string | number;
  priorityOrder: number;
}

async function seed() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    console.log('Seeding Event Fine Policies & Rules for Live Events...\n');

    // 1. Ensure / get system admin user
    let userRes = await client.query(`SELECT "userId" FROM ssc."Users" WHERE "isActive" = TRUE ORDER BY "userId" ASC LIMIT 1`);
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
    console.log(`✓ Admin User ID: ${userId}`);

    // 2. Fetch available Fine Policy Templates & Rules for reference
    const tplRulesRes = await client.query<TemplateRuleRow>(`
      SELECT 
        t."templateCode",
        v."finePolicyTemplateVersionId",
        r."sessionTypeCode",
        r."violationCode",
        r."fineAmount",
        r."priorityOrder"
      FROM ssc."FinePolicyTemplates" t
      JOIN ssc."FinePolicyTemplateVersions" v ON v."finePolicyTemplateId" = t."finePolicyTemplateId"
      JOIN ssc."FinePolicyTemplateRules" r ON r."finePolicyTemplateVersionId" = v."finePolicyTemplateVersionId"
      WHERE v."versionStatusCode" = 'PUBLISHED'
      ORDER BY t."templateCode", r."sessionTypeCode", r."violationCode"
    `);

    // Map: templateCode -> sessionTypeCode:violationCode -> { fineAmount, priorityOrder }
    const templateRateMap = new Map<string, Map<string, { fineAmount: number; priorityOrder: number }>>();
    for (const row of tplRulesRes.rows) {
      if (!templateRateMap.has(row.templateCode)) {
        templateRateMap.set(row.templateCode, new Map());
      }
      templateRateMap.get(row.templateCode)!.set(`${row.sessionTypeCode}:${row.violationCode}`, {
        fineAmount: Number(row.fineAmount),
        priorityOrder: row.priorityOrder ?? 100,
      });
    }

    // 3. Query all live events
    const eventsRes = await client.query<EventRow>(`
      SELECT "eventId", "academicTermId", "eventCode", "eventName", "eventStartDate" AS "eventDate", "eventStatusCode"
      FROM ssc."Events"
      ORDER BY "eventId" ASC
    `);

    if (eventsRes.rows.length === 0) {
      console.log('No live events found in ssc."Events". Please create an event first.');
      return;
    }

    console.log(`Found ${eventsRes.rows.length} live event(s).\n`);

    for (const event of eventsRes.rows) {
      console.log(`============================================================`);
      console.log(`Processing Event: "${event.eventName}" [ID: ${event.eventId}, Code: ${event.eventCode}]`);

      // 4. Query sessions for this event
      const sessionsRes = await client.query<SessionRow>(`
        SELECT "eventSessionId", "eventId", "sessionCode", "sessionName", "sessionTypeCode", "requiresCheckOut"
        FROM ssc."EventSessions"
        WHERE "eventId" = $1
        ORDER BY "startsAtUtc" ASC, "eventSessionId" ASC
      `, [event.eventId]);

      const sessions = sessionsRes.rows;
      console.log(`  Found ${sessions.length} session(s) for this event.`);

      // 5. Ensure EventFinePolicy exists
      const policyCode = `FP-${event.eventCode || `EVT-${event.eventId}`}`;
      const policyName = `${event.eventName} Fine Policy`;

      let policyRes = await client.query(`
        SELECT "eventFinePolicyId", "policyCode", "maximumFinePerStudent"
        FROM ssc."EventFinePolicies"
        WHERE "eventId" = $1
      `, [event.eventId]);

      let policyId: number;
      if (policyRes.rows.length === 0) {
        const hasAmPm = sessions.some(s => s.sessionTypeCode === 'AM' || s.sessionTypeCode === 'PM');
        const defaultTemplateCode = hasAmPm ? 'STANDARD_SCHOOL_EVENT' : 'STD-FINE-POLICY';

        // Check if template version exists
        const tplVerRes = await client.query(`
          SELECT v."finePolicyTemplateVersionId"
          FROM ssc."FinePolicyTemplateVersions" v
          JOIN ssc."FinePolicyTemplates" t ON t."finePolicyTemplateId" = v."finePolicyTemplateId"
          WHERE t."templateCode" = $1 AND v."versionStatusCode" = 'PUBLISHED'
          ORDER BY v."versionNumber" DESC LIMIT 1
        `, [defaultTemplateCode]);

        const templateVersionId = tplVerRes.rows[0]?.finePolicyTemplateVersionId;

        if (templateVersionId) {
          const createRes = await client.query(`
            SELECT sp_event_fine_policy_create_from_template($1, $2, $3, $4, $5) AS policy_id
          `, [event.eventId, templateVersionId, policyCode, policyName, userId]);
          policyId = createRes.rows[0].policy_id;
          console.log(`  ✓ Created EventFinePolicy from template '${defaultTemplateCode}' [Policy ID: ${policyId}]`);
        } else {
          const newPolicy = await client.query(`
            INSERT INTO ssc."EventFinePolicies" (
              "eventId", "policyCode", "policyName", "currencyCode", "maximumFinePerStudent", "policyStatusCode", "createdByUserId"
            ) VALUES ($1, $2, $3, 'PHP', 500.00, 'DRAFT', $4)
            RETURNING "eventFinePolicyId"
          `, [event.eventId, policyCode, policyName, userId]);
          policyId = newPolicy.rows[0].eventFinePolicyId;
          console.log(`  ✓ Created EventFinePolicy directly [Policy ID: ${policyId}]`);
        }
      } else {
        policyId = policyRes.rows[0].eventFinePolicyId;
        console.log(`  ✓ Existing EventFinePolicy found [Policy ID: ${policyId}, Code: ${policyRes.rows[0].policyCode}]`);
      }

      // 6. Seed / Upsert rules for each session
      let ruleCount = 0;
      for (const session of sessions) {
        const sType = (session.sessionTypeCode || 'GENERAL').toUpperCase();
        
        // Determine rules for this session
        const violations: Array<{ violationCode: string; amount: number; priority: number }> = [];

        // Determine rate map: check STANDARD_SCHOOL_EVENT, then STD-FINE-POLICY, then standard fallbacks
        const schoolRates = templateRateMap.get('STANDARD_SCHOOL_EVENT');
        const stdRates = templateRateMap.get('STD-FINE-POLICY');

        // Rule: ABSENT
        const absentRate = schoolRates?.get(`${sType}:ABSENT`) ?? stdRates?.get(`GENERAL:ABSENT`);
        const absentAmount = absentRate ? absentRate.fineAmount : (sType === 'PM' ? 150.0 : 100.0);
        violations.push({ violationCode: 'ABSENT', amount: absentAmount, priority: 100 });

        // Rule: LATE
        const lateRate = schoolRates?.get(`${sType}:LATE`) ?? stdRates?.get(`GENERAL:LATE`);
        const lateAmount = lateRate ? lateRate.fineAmount : (sType === 'PM' ? 75.0 : 50.0);
        violations.push({ violationCode: 'LATE', amount: lateAmount, priority: 100 });

        // Rule: MISSED_CHECKOUT (if session requires checkout)
        if (session.requiresCheckOut) {
          const missedRate = schoolRates?.get(`${sType}:MISSED_CHECKOUT`) ?? stdRates?.get(`GENERAL:MISSED_CHECKOUT`);
          const missedAmount = missedRate ? missedRate.fineAmount : (sType === 'PM' ? 75.0 : 50.0);
          violations.push({ violationCode: 'MISSED_CHECKOUT', amount: missedAmount, priority: 100 });
        }

        // Upsert rules into ssc."EventFineRules"
        for (const v of violations) {
          await client.query(`
            INSERT INTO ssc."EventFineRules" (
              "eventFinePolicyId", "eventId", "eventSessionId", "violationCode", "fineAmount", "priorityOrder", "isActive"
            ) VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            ON CONFLICT ("eventFinePolicyId", "eventSessionId", "violationCode")
            DO UPDATE SET 
              "fineAmount" = EXCLUDED."fineAmount",
              "priorityOrder" = EXCLUDED."priorityOrder",
              "isActive" = TRUE
          `, [policyId, event.eventId, session.eventSessionId, v.violationCode, v.amount, v.priority]);
          ruleCount++;
        }
      }

      console.log(`  ✓ Seeded/Updated ${ruleCount} fine rules across ${sessions.length} sessions.`);

      // 7. Print policy matrix for this event
      const policyDetails = await getEventFinePolicy(client, event.eventId);
      console.log(`\n  --- Fine Policy Rule Matrix for Event ${event.eventId} ---`);
      if (policyDetails && policyDetails.sessions) {
        for (const s of policyDetails.sessions) {
          console.log(`    Session [${s.session_code}] ${s.session_name} (${s.session_type_code}):`);
          if (s.rules.length === 0) {
            console.log(`      (No rules defined)`);
          } else {
            for (const r of s.rules) {
              console.log(`      - ${r.violation_code.padEnd(16)}: PHP ${Number(r.effective_fine_amount).toFixed(2)} (Priority: ${r.priority_order})`);
            }
          }
        }
      }
      console.log('');
    }

    console.log('>>> All Event Fine Policies and Rules seeded successfully! <<<\n');
  } catch (err: any) {
    console.error('Failed to seed event fine rules:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
