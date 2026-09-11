import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME || 'ssc',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD || '@2020',
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding fine policy templates...');

    // Find or create admin user
    let userRes = await client.query('SELECT "userId" FROM ssc."Users" ORDER BY "userId" ASC LIMIT 1');
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

    const templates = [
      {
        code: 'STD-FINE-POLICY',
        name: 'Standard Attendance Fine Policy',
        description: 'Standard attendance fine rules for regular campus events and academic seminars.',
        maxFine: 500.0,
        rules: [
          { sessionType: 'GENERAL', violation: 'ABSENT', amount: 100.0, priority: 100 },
          { sessionType: 'GENERAL', violation: 'MISSED_CHECKOUT', amount: 50.0, priority: 100 },
        ],
      },
      {
        code: 'MAJOR-EVENT-POLICY',
        name: 'Major Institutional Event Policy',
        description: 'Enforced for university-wide mandatory events, foundation days, and general convocations.',
        maxFine: 1000.0,
        rules: [
          { sessionType: 'GENERAL', violation: 'ABSENT', amount: 200.0, priority: 100 },
          { sessionType: 'GENERAL', violation: 'MISSED_CHECKOUT', amount: 100.0, priority: 100 },
        ],
      },
      {
        code: 'ASSEMBLY-FINE-POLICY',
        name: 'General Assembly Fine Policy',
        description: 'Lightweight fine policy for student council meetings and general assemblies.',
        maxFine: 300.0,
        rules: [
          { sessionType: 'GENERAL', violation: 'ABSENT', amount: 50.0, priority: 100 },
          { sessionType: 'GENERAL', violation: 'MISSED_CHECKOUT', amount: 25.0, priority: 100 },
        ],
      },
      {
        code: 'STANDARD_SCHOOL_EVENT',
        name: 'Standard School Event Policy',
        description: 'Standard multi-session policy with differentiated AM and PM absence and tardiness rates.',
        maxFine: 500.0,
        rules: [
          { sessionType: 'AM', violation: 'ABSENT', amount: 100.0, priority: 100 },
          { sessionType: 'AM', violation: 'LATE', amount: 50.0, priority: 100 },
          { sessionType: 'PM', violation: 'ABSENT', amount: 150.0, priority: 100 },
          { sessionType: 'PM', violation: 'LATE', amount: 75.0, priority: 100 },
        ],
      },
    ];

    for (const t of templates) {
      // 1. Insert Template
      const tplRes = await client.query(
        `INSERT INTO ssc."FinePolicyTemplates" (
           "templateCode", "templateName", "description", "isActive", "createdByUserId"
         ) VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT ("templateCode") DO UPDATE
         SET "templateName" = EXCLUDED."templateName",
             "description" = EXCLUDED."description",
             "isActive" = TRUE
         RETURNING "finePolicyTemplateId"`,
        [t.code, t.name, t.description, userId],
      );
      const templateId = tplRes.rows[0].finePolicyTemplateId;

      // 2. Insert Version 1 (PUBLISHED)
      const verRes = await client.query(
        `INSERT INTO ssc."FinePolicyTemplateVersions" (
           "finePolicyTemplateId", "versionNumber", "versionStatusCode",
           "currencyCode", "maximumFinePerStudent", "createdByUserId", "publishedAtUtc"
         ) VALUES ($1, 1, 'PUBLISHED', 'PHP', $2, $3, clock_timestamp())
         ON CONFLICT ("finePolicyTemplateId", "versionNumber") DO UPDATE
         SET "versionStatusCode" = 'PUBLISHED',
             "maximumFinePerStudent" = EXCLUDED."maximumFinePerStudent"
         RETURNING "finePolicyTemplateVersionId"`,
        [templateId, t.maxFine, userId],
      );
      const versionId = verRes.rows[0].finePolicyTemplateVersionId;

      // 3. Insert Rules
      for (const r of t.rules) {
        await client.query(
          `INSERT INTO ssc."FinePolicyTemplateRules" (
             "finePolicyTemplateVersionId", "sessionTypeCode", "violationCode",
             "fineAmount", "priorityOrder", "isActive"
           ) VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT ("finePolicyTemplateVersionId", "sessionTypeCode", "violationCode") DO UPDATE
           SET "fineAmount" = EXCLUDED."fineAmount",
               "priorityOrder" = EXCLUDED."priorityOrder",
               "isActive" = TRUE`,
          [versionId, r.sessionType, r.violation, r.amount, r.priority],
        );
      }

      console.log(`✓ Seeded template "${t.name}" (${t.code}) with Version 1 and ${t.rules.length} rules.`);
    }

    console.log('\n>>> All fine policy templates seeded successfully! <<<');
  } catch (err: any) {
    console.error('Failed to seed templates:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
