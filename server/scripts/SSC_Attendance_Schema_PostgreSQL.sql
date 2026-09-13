-- ============================================================================
-- SSC Attendance Database - Hardened  PostgreSQL Database Schema
-- Dialect: PostgreSQL 13+ (PL/pgSQL)
-- ============================================================================
-- Description:
-- Production-grade, hardened schema for SSC Attendance and Event
-- Fine Policy Management.
--
-- Key Protections & Normalization Guarantees:
--  - Multi-column relational consistency:
--      * Sections guarantee program, term, and year level alignment with enrollments.
--      * Event registrations guarantee student identity matches enrollment identity.
--      * Fine assessments guarantee participant identity matches session identity.
--      * Fine rules guarantee policy and session belong to the same event.
--  - Quoted identifiers: PascalCase tables, camelCase columns
--    (e.g. "AttendanceDevices"."deviceName"). REST JSON stays snake_case.
--  - Append-only immutable logs and audit trails.
--  - Safe concurrency with row-level locks and transactional state transitions.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ssc;
SET search_path TO ssc;


-- ----------------------------------------------------------------------------
-- 1. USERS & AUTHORIZATION
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Users" (
    "userId" INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "externalSubject" VARCHAR(200) NOT NULL UNIQUE,
    "displayName" VARCHAR(200) NOT NULL,
    "canManageAttendance" BOOLEAN NOT NULL DEFAULT FALSE,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 2. ACADEMIC HIERARCHY
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AcademicYears" (
    "academicYearId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "yearCode" VARCHAR(30) NOT NULL UNIQUE,
    "yearName" VARCHAR(100) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_academic_years_dates CHECK ("startsOn" <= "endsOn")
);

CREATE TABLE IF NOT EXISTS "AcademicTerms" (
    "academicTermId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "academicYearId" BIGINT NOT NULL REFERENCES "AcademicYears"("academicYearId"),
    "termCode" VARCHAR(30) NOT NULL,
    "termName" VARCHAR(100) NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_academic_terms_year_code UNIQUE ("academicYearId", "termCode"),
    CONSTRAINT ck_academic_terms_dates CHECK ("startsOn" <= "endsOn")
);

CREATE TABLE IF NOT EXISTS "AcademicPrograms" (
    "academicProgramId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "programCode" VARCHAR(30) NOT NULL UNIQUE,
    "programName" VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS "Sections" (
    "sectionId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "academicTermId" BIGINT NOT NULL REFERENCES "AcademicTerms"("academicTermId"),
    "academicProgramId" BIGINT NOT NULL REFERENCES "AcademicPrograms"("academicProgramId"),
    "yearLevel" SMALLINT NOT NULL,
    "sectionCode" VARCHAR(30) NOT NULL,
    "sectionName" VARCHAR(100) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_sections_term_program_year_code UNIQUE ("academicTermId", "academicProgramId", "yearLevel", "sectionCode"),
    CONSTRAINT uq_sections_context UNIQUE ("academicTermId", "academicProgramId", "yearLevel", "sectionId"),
    CONSTRAINT ck_sections_year_level CHECK ("yearLevel" BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS "Students" (
    "studentId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "studentNumber" VARCHAR(50) NOT NULL UNIQUE,
    "firstName" VARCHAR(100) NOT NULL,
    "middleName" VARCHAR(100) NULL,
    "lastName" VARCHAR(100) NOT NULL,
    suffix VARCHAR(20) NULL,
    "institutionalEmail" VARCHAR(200) NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS "StudentEnrollments" (
    "studentEnrollmentId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "studentId" BIGINT NOT NULL REFERENCES "Students"("studentId"),
    "academicTermId" BIGINT NOT NULL REFERENCES "AcademicTerms"("academicTermId"),
    "academicProgramId" BIGINT NOT NULL REFERENCES "AcademicPrograms"("academicProgramId"),
    "sectionId" BIGINT NULL,
    "yearLevel" SMALLINT NOT NULL,
    "enrollmentStatusCode" VARCHAR(20) NOT NULL DEFAULT 'ENROLLED',
    "effectiveFromUtc" TIMESTAMPTZ NOT NULL,
    "effectiveToUtc" TIMESTAMPTZ NULL,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_student_enrollments_student_term UNIQUE ("studentEnrollmentId", "studentId"),
    CONSTRAINT fk_student_enrollments_section_context FOREIGN KEY ("academicTermId", "academicProgramId", "yearLevel", "sectionId")
        REFERENCES "Sections"("academicTermId", "academicProgramId", "yearLevel", "sectionId"),
    CONSTRAINT ck_student_enrollments_period CHECK ("effectiveToUtc" IS NULL OR "effectiveFromUtc" <= "effectiveToUtc"),
    CONSTRAINT ck_student_enrollments_year_level CHECK ("yearLevel" BETWEEN 1 AND 20),
    CONSTRAINT ck_student_enrollments_status CHECK ("enrollmentStatusCode" IN ('ENROLLED', 'WITHDRAWN', 'LOA', 'EXPELLED', 'GRADUATED'))
);

CREATE INDEX IF NOT EXISTS ix_student_enrollments_roster 
    ON "StudentEnrollments"("academicTermId", "academicProgramId", "sectionId", "yearLevel", "enrollmentStatusCode");

-- ----------------------------------------------------------------------------
-- 3. EVENT MANAGEMENT & SESSIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Events" (
    "eventId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "academicTermId" BIGINT NOT NULL REFERENCES "AcademicTerms"("academicTermId"),
    "eventCode" VARCHAR(50) NOT NULL UNIQUE,
    "eventName" VARCHAR(200) NOT NULL,
    "eventStatusCode" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_events_context UNIQUE ("eventId", "academicTermId"),
    CONSTRAINT ck_events_status CHECK ("eventStatusCode" IN ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS "EventSessions" (
    "eventSessionId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventId" BIGINT NOT NULL REFERENCES "Events"("eventId"),
    "sessionCode" VARCHAR(30) NOT NULL,
    "sessionName" VARCHAR(100) NOT NULL,
    "sessionTypeCode" VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    "startsAtUtc" TIMESTAMPTZ NOT NULL,
    "endsAtUtc" TIMESTAMPTZ NOT NULL,
    "checkInOpensAtUtc" TIMESTAMPTZ NOT NULL,
    "checkInClosesAtUtc" TIMESTAMPTZ NOT NULL,
    "lateAfterUtc" TIMESTAMPTZ NOT NULL,
    "checkOutOpensAtUtc" TIMESTAMPTZ NULL,
    "checkOutClosesAtUtc" TIMESTAMPTZ NULL,
    "requiresCheckOut" BOOLEAN NOT NULL DEFAULT FALSE,
    "minimumMinutes" SMALLINT NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_event_sessions_code UNIQUE ("eventId", "sessionCode"),
    CONSTRAINT uq_event_sessions_event_context UNIQUE ("eventSessionId", "eventId"),
    CONSTRAINT uq_event_sessions_type_context UNIQUE ("eventSessionId", "eventId", "sessionTypeCode"),
    CONSTRAINT ck_event_sessions_times CHECK ("startsAtUtc" < "endsAtUtc"),
    CONSTRAINT ck_event_sessions_checkin_window CHECK ("checkInOpensAtUtc" <= "checkInClosesAtUtc"),
    CONSTRAINT ck_event_sessions_late_window CHECK ("lateAfterUtc" >= "checkInOpensAtUtc" AND "lateAfterUtc" <= "checkInClosesAtUtc"),
    CONSTRAINT ck_event_sessions_checkout_window CHECK (
        ("requiresCheckOut" = FALSE AND "checkOutOpensAtUtc" IS NULL AND "checkOutClosesAtUtc" IS NULL)
        OR ("requiresCheckOut" = TRUE AND "checkOutOpensAtUtc" IS NOT NULL AND "checkOutClosesAtUtc" IS NOT NULL 
            AND "checkOutOpensAtUtc" <= "checkOutClosesAtUtc" AND "checkOutOpensAtUtc" >= "checkInOpensAtUtc")
    )
);

CREATE TABLE IF NOT EXISTS "EventAudienceRules" (
    "eventAudienceRuleId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventId" BIGINT NOT NULL REFERENCES "Events"("eventId"),
    "academicTermId" BIGINT NOT NULL,
    "audienceScopeCode" VARCHAR(20) NOT NULL,
    "academicProgramId" BIGINT NULL REFERENCES "AcademicPrograms"("academicProgramId"),
    "sectionId" BIGINT NULL,
    "yearLevel" SMALLINT NULL,
    "studentId" BIGINT NULL REFERENCES "Students"("studentId"),
    "isRequired" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_event_audience_rules_context UNIQUE ("eventId", "audienceScopeCode", "academicProgramId", "sectionId", "yearLevel", "studentId"),
    CONSTRAINT fk_event_audience_rules_event_term FOREIGN KEY ("eventId", "academicTermId")
        REFERENCES "Events"("eventId", "academicTermId"),
    CONSTRAINT fk_event_audience_rules_section_context FOREIGN KEY ("academicTermId", "academicProgramId", "yearLevel", "sectionId")
        REFERENCES "Sections"("academicTermId", "academicProgramId", "yearLevel", "sectionId"),
    CONSTRAINT ck_event_audience_rules_scope CHECK (
        ("audienceScopeCode" = 'ALL_STUDENTS' AND "academicProgramId" IS NULL AND "sectionId" IS NULL AND "yearLevel" IS NULL AND "studentId" IS NULL)
        OR ("audienceScopeCode" = 'PROGRAM' AND "academicProgramId" IS NOT NULL AND "sectionId" IS NULL AND "yearLevel" IS NULL AND "studentId" IS NULL)
        OR ("audienceScopeCode" = 'YEAR_LEVEL' AND "academicProgramId" IS NULL AND "sectionId" IS NULL AND "yearLevel" IS NOT NULL AND "studentId" IS NULL)
        OR ("audienceScopeCode" = 'SECTION' AND "academicProgramId" IS NOT NULL AND "sectionId" IS NOT NULL AND "yearLevel" IS NOT NULL AND "studentId" IS NULL)
        OR ("audienceScopeCode" = 'STUDENT' AND "academicProgramId" IS NULL AND "sectionId" IS NULL AND "yearLevel" IS NULL AND "studentId" IS NOT NULL)
    ),
    CONSTRAINT ck_event_audience_rules_year CHECK ("yearLevel" IS NULL OR "yearLevel" BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS "EventRegistrations" (
    "eventRegistrationId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventId" BIGINT NOT NULL REFERENCES "Events"("eventId"),
    "studentEnrollmentId" BIGINT NOT NULL,
    "studentId" BIGINT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT TRUE,
    "registrationStatusCode" VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    "sourceAudienceRuleId" BIGINT NULL REFERENCES "EventAudienceRules"("eventAudienceRuleId"),
    "registeredByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "registeredAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_event_registrations_event_student UNIQUE ("eventId", "studentId"),
    CONSTRAINT fk_event_registrations_enrollment_student FOREIGN KEY ("studentEnrollmentId", "studentId")
        REFERENCES "StudentEnrollments"("studentEnrollmentId", "studentId"),
    CONSTRAINT ck_event_registrations_status CHECK ("registrationStatusCode" IN ('ACTIVE', 'EXEMPTED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS "EventParticipants" (
    "eventParticipantId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventSessionId" BIGINT NOT NULL REFERENCES "EventSessions"("eventSessionId"),
    "studentId" BIGINT NOT NULL REFERENCES "Students"("studentId"),
    "isRequired" BOOLEAN NOT NULL DEFAULT TRUE,
    "addedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "addedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_event_participants_session_student UNIQUE ("eventSessionId", "studentId"),
    CONSTRAINT uq_event_participants_session_context UNIQUE ("eventParticipantId", "eventSessionId")
);

CREATE INDEX IF NOT EXISTS ix_event_participants_student 
    ON "EventParticipants"("studentId", "eventSessionId");

CREATE TABLE IF NOT EXISTS "EventParticipantQrCredentials" (
    "eventParticipantQrCredentialId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventRegistrationId" BIGINT NOT NULL REFERENCES "EventRegistrations"("eventRegistrationId"),
    "tokenHash" BYTEA NOT NULL UNIQUE,
    "issuedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "issuedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "expiresAtUtc" TIMESTAMPTZ NULL,
    "revokedByUserId" INT NULL REFERENCES "Users"("userId"),
    "revokedAtUtc" TIMESTAMPTZ NULL,
    "revocationReason" VARCHAR(500) NULL,
    CONSTRAINT ck_event_participant_qr_credentials_expiry CHECK ("expiresAtUtc" IS NULL OR "expiresAtUtc" > "issuedAtUtc"),
    CONSTRAINT ck_event_participant_qr_credentials_revoke CHECK (
        ("revokedAtUtc" IS NULL AND "revokedByUserId" IS NULL AND "revocationReason" IS NULL)
        OR ("revokedAtUtc" IS NOT NULL AND "revokedByUserId" IS NOT NULL AND "revocationReason" IS NOT NULL AND LENGTH(TRIM("revocationReason")) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_event_participant_qr_credentials_active
    ON "EventParticipantQrCredentials"("eventRegistrationId")
    WHERE "revokedAtUtc" IS NULL;

-- Per-event UUID QR token store (Approach B — one token per student per event, revokable)
CREATE TABLE IF NOT EXISTS "EventParticipantTokens" (
    "tokenId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventId" BIGINT NOT NULL REFERENCES "Events"("eventId") ON DELETE CASCADE,
    "studentId" BIGINT NOT NULL REFERENCES "Students"("studentId") ON DELETE CASCADE,
    "token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "isRevoked" BOOLEAN NOT NULL DEFAULT FALSE,
    "issuedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "issuedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "revokedAtUtc" TIMESTAMPTZ NULL,
    "revokedByUserId" INT NULL REFERENCES "Users"("userId"),
    CONSTRAINT uq_event_participant_tokens_event_student UNIQUE ("eventId", "studentId"),
    CONSTRAINT uq_event_participant_tokens_token UNIQUE ("token"),
    CONSTRAINT ck_event_participant_tokens_revoke CHECK (
        ("isRevoked" = FALSE AND "revokedAtUtc" IS NULL AND "revokedByUserId" IS NULL)
        OR ("isRevoked" = TRUE AND "revokedAtUtc" IS NOT NULL AND "revokedByUserId" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_event_participant_tokens_event
    ON "EventParticipantTokens"("eventId", "studentId");

-- ----------------------------------------------------------------------------
-- 4. ATTENDANCE SCANNING & AUDIT LOGS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AttendanceDevices" (
    "attendanceDeviceId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "deviceCode" VARCHAR(50) NOT NULL UNIQUE,
    "deviceName" VARCHAR(150) NOT NULL,
    "deviceFingerprintHash" BYTEA NOT NULL UNIQUE,
    "assignedToUserId" INT NULL REFERENCES "Users"("userId"),
    "deviceStatusCode" VARCHAR(12) NOT NULL DEFAULT 'ACTIVE',
    "registeredByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "registeredAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "lastSeenAtUtc" TIMESTAMPTZ NULL,
    "revokedAtUtc" TIMESTAMPTZ NULL,
    CONSTRAINT ck_attendance_devices_status CHECK ("deviceStatusCode" IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    CONSTRAINT ck_attendance_devices_revoke CHECK (
        ("deviceStatusCode" <> 'REVOKED' AND "revokedAtUtc" IS NULL)
        OR ("deviceStatusCode" = 'REVOKED' AND "revokedAtUtc" IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS "AttendanceRecords" (
    "attendanceRecordId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventParticipantId" BIGINT NOT NULL UNIQUE REFERENCES "EventParticipants"("eventParticipantId"),
    "checkedInAtUtc" TIMESTAMPTZ NULL,
    "checkedOutAtUtc" TIMESTAMPTZ NULL,
    "isExcused" BOOLEAN NOT NULL DEFAULT FALSE,
    "excuseReason" VARCHAR(500) NULL,
    "lastChangedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "lastChangedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_attendance_records_times CHECK (
        "checkedInAtUtc" IS NULL OR "checkedOutAtUtc" IS NULL OR "checkedInAtUtc" <= "checkedOutAtUtc"
    )
);

CREATE TABLE IF NOT EXISTS "AttendanceCorrections" (
    "attendanceCorrectionId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "attendanceRecordId" BIGINT NOT NULL REFERENCES "AttendanceRecords"("attendanceRecordId"),
    "correctionStatusCode" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "proposedCheckInAtUtc" TIMESTAMPTZ NULL,
    "proposedCheckOutAtUtc" TIMESTAMPTZ NULL,
    "proposedIsExcused" BOOLEAN NOT NULL DEFAULT FALSE,
    "proposedExcuseReason" VARCHAR(500) NULL,
    reason VARCHAR(1000) NOT NULL,
    "requestedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "requestedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "reviewedByUserId" INT NULL REFERENCES "Users"("userId"),
    "reviewedAtUtc" TIMESTAMPTZ NULL,
    "reviewNotes" VARCHAR(1000) NULL,
    CONSTRAINT ck_attendance_corrections_status CHECK ("correctionStatusCode" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS ix_attendance_corrections_queue 
    ON "AttendanceCorrections"("correctionStatusCode", "requestedAtUtc");

CREATE TABLE IF NOT EXISTS "AttendanceLogs" (
    "attendanceLogId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "attendanceRecordId" BIGINT NOT NULL REFERENCES "AttendanceRecords"("attendanceRecordId"),
    "actionCode" VARCHAR(20) NOT NULL,
    "oldCheckInAtUtc" TIMESTAMPTZ NULL,
    "oldCheckOutAtUtc" TIMESTAMPTZ NULL,
    "newCheckInAtUtc" TIMESTAMPTZ NULL,
    "newCheckOutAtUtc" TIMESTAMPTZ NULL,
    "oldIsExcused" BOOLEAN NULL,
    "newIsExcused" BOOLEAN NULL,
    "actorUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "loggedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ix_attendance_logs_record 
    ON "AttendanceLogs"("attendanceRecordId", "attendanceLogId");

CREATE TABLE IF NOT EXISTS "AttendanceScanAttempts" (
    "attendanceScanAttemptId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventSessionId" BIGINT NOT NULL REFERENCES "EventSessions"("eventSessionId"),
    "eventRegistrationId" BIGINT NULL REFERENCES "EventRegistrations"("eventRegistrationId"),
    "eventParticipantId" BIGINT NULL REFERENCES "EventParticipants"("eventParticipantId"),
    "attendanceDeviceId" BIGINT NULL REFERENCES "AttendanceDevices"("attendanceDeviceId"),
    "tokenHash" BYTEA NULL,
    "actionCode" VARCHAR(3) NOT NULL,
    "scanResultCode" VARCHAR(20) NOT NULL,
    "failureReasonCode" VARCHAR(40) NULL,
    "processedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "scannedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_attendance_scan_attempts_action CHECK ("actionCode" IN ('IN', 'OUT')),
    CONSTRAINT ck_attendance_scan_attempts_result CHECK ("scanResultCode" IN ('ACCEPTED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS ix_attendance_scan_attempts_session_time
    ON "AttendanceScanAttempts"("eventSessionId", "scannedAtUtc");

CREATE INDEX IF NOT EXISTS ix_attendance_scan_attempts_token_time
    ON "AttendanceScanAttempts"("tokenHash", "scannedAtUtc");

-- ----------------------------------------------------------------------------
-- 5. FINE POLICY ENGINE & TEMPLATES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "FinePolicyTemplates" (
    "finePolicyTemplateId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "templateCode" VARCHAR(50) NOT NULL UNIQUE,
    "templateName" VARCHAR(150) NOT NULL,
    description VARCHAR(500) NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS "FinePolicyTemplateVersions" (
    "finePolicyTemplateVersionId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "finePolicyTemplateId" BIGINT NOT NULL REFERENCES "FinePolicyTemplates"("finePolicyTemplateId"),
    "versionNumber" INT NOT NULL,
    "versionStatusCode" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "maximumFinePerStudent" NUMERIC(12,2) NULL,
    "createdByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "publishedAtUtc" TIMESTAMPTZ NULL,
    "retiredAtUtc" TIMESTAMPTZ NULL,
    CONSTRAINT uq_fine_policy_template_versions_num UNIQUE ("finePolicyTemplateId", "versionNumber"),
    CONSTRAINT ck_fine_policy_template_versions_status CHECK ("versionStatusCode" IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    CONSTRAINT ck_fine_policy_template_versions_max_fine CHECK ("maximumFinePerStudent" IS NULL OR "maximumFinePerStudent" >= 0)
);

CREATE TABLE IF NOT EXISTS "FinePolicyTemplateRules" (
    "finePolicyTemplateRuleId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "finePolicyTemplateVersionId" BIGINT NOT NULL REFERENCES "FinePolicyTemplateVersions"("finePolicyTemplateVersionId"),
    "sessionTypeCode" VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
    "violationCode" VARCHAR(30) NOT NULL,
    "fineAmount" NUMERIC(12,2) NOT NULL,
    "priorityOrder" SMALLINT NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_fine_policy_template_rules_unique UNIQUE ("finePolicyTemplateVersionId", "sessionTypeCode", "violationCode"),
    CONSTRAINT ck_fine_policy_template_rules_amount CHECK ("fineAmount" >= 0)
);

CREATE TABLE IF NOT EXISTS "EventFinePolicies" (
    "eventFinePolicyId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventId" BIGINT NOT NULL UNIQUE REFERENCES "Events"("eventId"),
    "sourceFinePolicyTemplateVersionId" BIGINT NULL REFERENCES "FinePolicyTemplateVersions"("finePolicyTemplateVersionId"),
    "policyCode" VARCHAR(50) NOT NULL,
    "policyName" VARCHAR(200) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "maximumFinePerStudent" NUMERIC(12,2) NULL,
    "policyStatusCode" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "activatedAtUtc" TIMESTAMPTZ NULL,
    CONSTRAINT uq_event_fine_policies_event_context UNIQUE ("eventFinePolicyId", "eventId"),
    CONSTRAINT ck_event_fine_policies_status CHECK ("policyStatusCode" IN ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED')),
    CONSTRAINT ck_event_fine_policies_max_fine CHECK ("maximumFinePerStudent" IS NULL OR "maximumFinePerStudent" >= 0)
);

CREATE TABLE IF NOT EXISTS "EventFineRules" (
    "eventFineRuleId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventFinePolicyId" BIGINT NOT NULL,
    "eventId" BIGINT NOT NULL,
    "eventSessionId" BIGINT NOT NULL,
    "sourceFinePolicyTemplateRuleId" BIGINT NULL REFERENCES "FinePolicyTemplateRules"("finePolicyTemplateRuleId"),
    "violationCode" VARCHAR(30) NOT NULL,
    "fineAmount" NUMERIC(12,2) NOT NULL,
    "priorityOrder" SMALLINT NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_event_fine_rules_session_violation UNIQUE ("eventFinePolicyId", "eventSessionId", "violationCode"),
    CONSTRAINT fk_event_fine_rules_policy_event FOREIGN KEY ("eventFinePolicyId", "eventId")
        REFERENCES "EventFinePolicies"("eventFinePolicyId", "eventId"),
    CONSTRAINT fk_event_fine_rules_session_event FOREIGN KEY ("eventSessionId", "eventId")
        REFERENCES "EventSessions"("eventSessionId", "eventId"),
    CONSTRAINT ck_event_fine_rules_amount CHECK ("fineAmount" >= 0)
);

CREATE TABLE IF NOT EXISTS "EventFineRuleOverrides" (
    "eventFineRuleOverrideId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventFineRuleId" BIGINT NOT NULL UNIQUE REFERENCES "EventFineRules"("eventFineRuleId"),
    "fineAmount" NUMERIC(12,2) NOT NULL,
    "overrideReason" VARCHAR(500) NOT NULL,
    "overriddenByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "overriddenAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT ck_event_fine_rule_overrides_amount CHECK ("fineAmount" >= 0)
);

CREATE TABLE IF NOT EXISTS "StudentFineAssessments" (
    "studentFineAssessmentId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "eventParticipantId" BIGINT NOT NULL,
    "eventSessionId" BIGINT NOT NULL,
    "violationCode" VARCHAR(30) NOT NULL,
    "assessedAmount" NUMERIC(12,2) NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'PHP',
    "assessmentStatusCode" VARCHAR(20) NOT NULL DEFAULT 'ASSESSED',
    "assessedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "assessedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_student_fine_assessments_participant_violation UNIQUE ("eventParticipantId", "violationCode"),
    CONSTRAINT fk_student_fine_assessments_participant_session FOREIGN KEY ("eventParticipantId", "eventSessionId")
        REFERENCES "EventParticipants"("eventParticipantId", "eventSessionId"),
    CONSTRAINT ck_student_fine_assessments_amount CHECK ("assessedAmount" >= 0),
    CONSTRAINT ck_student_fine_assessments_status CHECK ("assessmentStatusCode" IN ('ASSESSED', 'PARTIALLY_PAID', 'PAID', 'WAIVED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS "StudentFineStatusHistory" (
    "studentFineStatusHistoryId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "studentFineAssessmentId" BIGINT NOT NULL REFERENCES "StudentFineAssessments"("studentFineAssessmentId"),
    "fromStatusCode" VARCHAR(20) NULL,
    "toStatusCode" VARCHAR(20) NOT NULL,
    "changeReason" VARCHAR(1000) NOT NULL,
    "changedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "changedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS ix_student_fine_status_history_assessment
    ON "StudentFineStatusHistory"("studentFineAssessmentId");

CREATE TABLE IF NOT EXISTS "FineWaiverRequests" (
    "fineWaiverRequestId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "studentFineAssessmentId" BIGINT NOT NULL REFERENCES "StudentFineAssessments"("studentFineAssessmentId"),
    "waiverReason" VARCHAR(1000) NOT NULL,
    "requestStatusCode" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "requestedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "reviewedByUserId" INT NULL REFERENCES "Users"("userId"),
    "reviewedAtUtc" TIMESTAMPTZ NULL,
    "reviewNotes" VARCHAR(1000) NULL,
    CONSTRAINT ck_fine_waiver_requests_status CHECK ("requestStatusCode" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fine_waiver_requests_pending
    ON "FineWaiverRequests"("studentFineAssessmentId")
    WHERE "requestStatusCode" = 'PENDING';

CREATE TABLE IF NOT EXISTS "FinePayments" (
    "finePaymentId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "paymentReference" VARCHAR(100) NOT NULL UNIQUE,
    "paymentMethodCode" VARCHAR(30) NOT NULL,
    "totalAmount" NUMERIC(12,2) NOT NULL,
    "paymentStatusCode" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    "receivedByUserId" INT NOT NULL REFERENCES "Users"("userId"),
    "receivedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    "externalPaymentReference" VARCHAR(100) NULL,
    "voidedByUserId" INT NULL REFERENCES "Users"("userId"),
    "voidedAtUtc" TIMESTAMPTZ NULL,
    "voidReason" VARCHAR(1000) NULL,
    CONSTRAINT ck_fine_payments_amount CHECK ("totalAmount" > 0),
    CONSTRAINT ck_fine_payments_method CHECK ("paymentMethodCode" IN ('CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER')),
    CONSTRAINT ck_fine_payments_status CHECK ("paymentStatusCode" IN ('PENDING', 'CONFIRMED', 'VOIDED', 'REFUNDED')),
    CONSTRAINT ck_fine_payments_void CHECK (
        ("paymentStatusCode" <> 'VOIDED' AND "voidedByUserId" IS NULL AND "voidedAtUtc" IS NULL AND "voidReason" IS NULL)
        OR ("paymentStatusCode" = 'VOIDED' AND "voidedByUserId" IS NOT NULL AND "voidedAtUtc" IS NOT NULL AND "voidReason" IS NOT NULL AND LENGTH(TRIM("voidReason")) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fine_payments_external_ref
    ON "FinePayments"("externalPaymentReference")
    WHERE "externalPaymentReference" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "FinePaymentAllocations" (
    "finePaymentAllocationId" BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "finePaymentId" BIGINT NOT NULL REFERENCES "FinePayments"("finePaymentId"),
    "studentFineAssessmentId" BIGINT NOT NULL REFERENCES "StudentFineAssessments"("studentFineAssessmentId"),
    "allocatedAmount" NUMERIC(12,2) NOT NULL,
    "allocatedAtUtc" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT uq_fine_payment_allocations_assessment UNIQUE ("finePaymentId", "studentFineAssessmentId"),
    CONSTRAINT ck_fine_payment_allocations_amount CHECK ("allocatedAmount" > 0)
);

CREATE INDEX IF NOT EXISTS ix_fine_payment_allocations_assessment
    ON "FinePaymentAllocations"("studentFineAssessmentId");

-- ----------------------------------------------------------------------------
-- 6. VIEWS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW "VwEventAttendance" AS
SELECT 
    e."eventId",
    e."eventCode",
    e."eventName",
    s."eventSessionId",
    s."sessionName",
    p."eventParticipantId",
    p."studentId",
    st."studentNumber",
    st."firstName",
    st."middleName",
    st."lastName",
    st.suffix,
    p."isRequired",
    a."attendanceRecordId",
    a."checkedInAtUtc",
    a."checkedOutAtUtc",
    CASE 
        WHEN a."checkedOutAtUtc" IS NOT NULL AND a."checkedInAtUtc" IS NOT NULL 
        THEN ROUND(EXTRACT(EPOCH FROM (a."checkedOutAtUtc" - a."checkedInAtUtc")) / 60.0, 2)
    END AS "attendedMinutes",
    (a."checkedInAtUtc" IS NOT NULL AND a."checkedInAtUtc" > s."lateAfterUtc") AS "isLate",
    CASE
        WHEN e."eventStatusCode" = 'CANCELLED' THEN 'CANCELLED'
        WHEN a."isExcused" = TRUE THEN 'EXCUSED'
        WHEN a."checkedInAtUtc" IS NULL THEN 
            CASE 
                WHEN s."isClosed" = TRUE OR e."eventStatusCode" = 'CLOSED' THEN 
                    CASE WHEN p."isRequired" = TRUE THEN 'ABSENT' ELSE 'NOT_ATTENDED' END 
                ELSE 'NOT_YET_RECORDED' 
            END
        WHEN s."requiresCheckOut" = TRUE AND a."checkedOutAtUtc" IS NULL THEN
            CASE 
                WHEN s."isClosed" = TRUE OR e."eventStatusCode" = 'CLOSED' THEN 'INCOMPLETE' 
                ELSE 'CHECKED_IN' 
            END
        WHEN s."requiresCheckOut" = TRUE AND EXTRACT(EPOCH FROM (a."checkedOutAtUtc" - a."checkedInAtUtc")) < (s."minimumMinutes" * 60) THEN 'INCOMPLETE'
        WHEN a."checkedInAtUtc" > s."lateAfterUtc" THEN 'LATE'
        ELSE 'PRESENT'
    END AS "attendanceStatus"
FROM "EventParticipants" p
JOIN "EventSessions" s ON s."eventSessionId" = p."eventSessionId"
JOIN "Events" e ON e."eventId" = s."eventId"
JOIN "Students" st ON st."studentId" = p."studentId"
LEFT JOIN "AttendanceRecords" a ON a."eventParticipantId" = p."eventParticipantId";

CREATE OR REPLACE VIEW "VwStudentFineBalances" AS
SELECT
    a."studentFineAssessmentId",
    p."studentId",
    st."studentNumber",
    a."eventSessionId",
    a."violationCode",
    a."assessedAmount",
    a."currencyCode",
    a."assessmentStatusCode",
    COALESCE(pay."confirmedPaidAmount", 0.00) AS "confirmedPaidAmount",
    CASE
        WHEN a."assessmentStatusCode" IN ('WAIVED', 'CANCELLED') THEN 0.00
        ELSE GREATEST(0.00, a."assessedAmount" - COALESCE(pay."confirmedPaidAmount", 0.00))
    END AS "outstandingAmount"
FROM "StudentFineAssessments" a
JOIN "EventParticipants" p ON p."eventParticipantId" = a."eventParticipantId"
JOIN "Students" st ON st."studentId" = p."studentId"
LEFT JOIN LATERAL (
    SELECT SUM(pa."allocatedAmount") AS "confirmedPaidAmount"
      FROM "FinePaymentAllocations" pa
      JOIN "FinePayments" fp ON fp."finePaymentId" = pa."finePaymentId"
     WHERE pa."studentFineAssessmentId" = a."studentFineAssessmentId"
       AND fp."paymentStatusCode" = 'CONFIRMED'
) pay ON TRUE;

-- ----------------------------------------------------------------------------
-- 7. BUSINESS INTEGRITY TRIGGERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_tr_academic_terms_dates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "AcademicYears" y
        WHERE y."academicYearId" = NEW."academicYearId"
          AND (NEW."startsOn" < y."startsOn" OR NEW."endsOn" > y."endsOn")
    ) THEN
        RAISE EXCEPTION 'Academic term dates must fall within the academic year dates.' USING ERRCODE = '52500';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_academic_terms_dates ON "AcademicTerms";
CREATE TRIGGER tr_academic_terms_dates
    BEFORE INSERT OR UPDATE ON "AcademicTerms"
    FOR EACH ROW EXECUTE FUNCTION fn_tr_academic_terms_dates();

CREATE OR REPLACE FUNCTION fn_tr_student_enrollments_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "StudentEnrollments" x
        WHERE x."studentId" = NEW."studentId" 
          AND x."academicTermId" = NEW."academicTermId"
          AND x."studentEnrollmentId" <> COALESCE(NEW."studentEnrollmentId", -1)
          AND (x."effectiveToUtc" IS NULL OR NEW."effectiveFromUtc" < x."effectiveToUtc")
          AND (NEW."effectiveToUtc" IS NULL OR x."effectiveFromUtc" < NEW."effectiveToUtc")
    ) THEN
        RAISE EXCEPTION 'Enrollment periods for the same student and term cannot overlap.' USING ERRCODE = '52502';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_student_enrollments_history ON "StudentEnrollments";
CREATE TRIGGER tr_student_enrollments_history
    BEFORE INSERT OR UPDATE ON "StudentEnrollments"
    FOR EACH ROW EXECUTE FUNCTION fn_tr_student_enrollments_history();

CREATE OR REPLACE FUNCTION fn_tr_events_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW."eventStatusCode" <> 'DRAFT' THEN
        RAISE EXCEPTION 'Create events as DRAFT.' USING ERRCODE = '52504';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW."eventStatusCode" <> OLD."eventStatusCode" AND NOT (
            (OLD."eventStatusCode" = 'DRAFT' AND NEW."eventStatusCode" IN ('PUBLISHED', 'CANCELLED')) OR
            (OLD."eventStatusCode" = 'PUBLISHED' AND NEW."eventStatusCode" IN ('CLOSED', 'CANCELLED'))
        ) THEN
            RAISE EXCEPTION 'Invalid event status transition from % to %.', OLD."eventStatusCode", NEW."eventStatusCode" USING ERRCODE = '52505';
        END IF;

        IF OLD."eventStatusCode" <> 'DRAFT' AND NEW."academicTermId" <> OLD."academicTermId" THEN
            RAISE EXCEPTION 'Published event academic term is frozen.' USING ERRCODE = '52506';
        END IF;

        IF NEW."eventStatusCode" = 'PUBLISHED' AND OLD."eventStatusCode" = 'DRAFT' THEN
            IF NOT EXISTS (SELECT 1 FROM "EventSessions" s WHERE s."eventId" = NEW."eventId") THEN
                RAISE EXCEPTION 'Publish requires at least one session.' USING ERRCODE = '52507';
            END IF;
            IF EXISTS (
                SELECT 1 FROM "EventSessions" s
                WHERE s."eventId" = NEW."eventId"
                  AND NOT EXISTS (SELECT 1 FROM "EventParticipants" p WHERE p."eventSessionId" = s."eventSessionId")
            ) THEN
                RAISE EXCEPTION 'Publish requires a roster for every session.' USING ERRCODE = '52507';
            END IF;
        END IF;

        IF NEW."eventStatusCode" = 'CLOSED' AND EXISTS (
            SELECT 1 FROM "EventSessions" s WHERE s."eventId" = NEW."eventId" AND s."isClosed" = FALSE
        ) THEN
            RAISE EXCEPTION 'Close every session before closing the event.' USING ERRCODE = '52508';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_events_lifecycle ON "Events";
CREATE TRIGGER tr_events_lifecycle
    BEFORE INSERT OR UPDATE ON "Events"
    FOR EACH ROW EXECUTE FUNCTION fn_tr_events_lifecycle();

CREATE OR REPLACE FUNCTION fn_tr_attendance_logs_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Attendance logs are append-only.' USING ERRCODE = '52515';
END;
$$;

DROP TRIGGER IF EXISTS tr_attendance_logs_append_only ON "AttendanceLogs";
CREATE TRIGGER tr_attendance_logs_append_only
    BEFORE UPDATE OR DELETE ON "AttendanceLogs"
    FOR EACH ROW EXECUTE FUNCTION fn_tr_attendance_logs_append_only();

-- ----------------------------------------------------------------------------
-- 8. STORED PROCEDURES & SERVICE FUNCTIONS
-- ----------------------------------------------------------------------------

-- 1. Record Attendance via Student Number
CREATE OR REPLACE PROCEDURE sp_attendance_record(
    p_event_session_id BIGINT,
    p_student_number VARCHAR(50),
    p_action_code VARCHAR(3), -- 'IN' or 'OUT'
    p_actor_user_id INT,
    INOUT p_changed BOOLEAN DEFAULT FALSE,
    INOUT p_attendance_record_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_in_open TIMESTAMPTZ; v_in_close TIMESTAMPTZ;
    v_out_open TIMESTAMPTZ; v_out_close TIMESTAMPTZ;
    v_requires_out BOOLEAN;
    v_participant_id BIGINT;
    v_in TIMESTAMPTZ; v_out TIMESTAMPTZ;
    v_excused BOOLEAN; v_excuse VARCHAR(500);
BEGIN
    IF p_action_code NOT IN ('IN', 'OUT') THEN
        RAISE EXCEPTION 'Action must be IN or OUT.' USING ERRCODE = '52100';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "Users" u
        WHERE u."userId" = p_actor_user_id AND u."isActive" = TRUE AND u."canManageAttendance" = TRUE
    ) THEN
        RAISE EXCEPTION 'Active attendance manager authorization required.' USING ERRCODE = '52101';
    END IF;

    SELECT s."checkInOpensAtUtc", s."checkInClosesAtUtc",
           s."checkOutOpensAtUtc", s."checkOutClosesAtUtc", s."requiresCheckOut"
      INTO v_in_open, v_in_close, v_out_open, v_out_close, v_requires_out
      FROM "EventSessions" s
      JOIN "Events" e ON e."eventId" = s."eventId"
     WHERE s."eventSessionId" = p_event_session_id
       AND s."isClosed" = FALSE AND e."eventStatusCode" = 'PUBLISHED'
     FOR SHARE;

    IF v_in_open IS NULL THEN
        RAISE EXCEPTION 'Session is not open for attendance.' USING ERRCODE = '52102';
    END IF;

    SELECT p."eventParticipantId" INTO v_participant_id
      FROM "EventParticipants" p
      JOIN "Students" st ON st."studentId" = p."studentId"
     WHERE p."eventSessionId" = p_event_session_id
       AND st."studentNumber" = p_student_number AND st."isActive" = TRUE
     FOR UPDATE;

    IF v_participant_id IS NULL THEN
        RAISE EXCEPTION 'Active student is not on this session roster.' USING ERRCODE = '52103';
    END IF;

    SELECT "attendanceRecordId", "checkedInAtUtc", "checkedOutAtUtc", "isExcused", "excuseReason"
      INTO p_attendance_record_id, v_in, v_out, v_excused, v_excuse
      FROM "AttendanceRecords"
     WHERE "eventParticipantId" = v_participant_id
     FOR UPDATE;

    IF p_action_code = 'IN' AND v_in IS NULL THEN
        IF v_now < v_in_open OR v_now > v_in_close THEN
            RAISE EXCEPTION 'Outside check-in window.' USING ERRCODE = '52104';
        END IF;
        IF p_attendance_record_id IS NULL THEN
            INSERT INTO "AttendanceRecords" (
                "eventParticipantId", "checkedInAtUtc", "lastChangedByUserId", "lastChangedAtUtc"
            ) VALUES (
                v_participant_id, v_now, p_actor_user_id, v_now
            ) RETURNING "attendanceRecordId" INTO p_attendance_record_id;
        ELSE
            UPDATE "AttendanceRecords"
               SET "checkedInAtUtc" = v_now, "lastChangedByUserId" = p_actor_user_id, "lastChangedAtUtc" = v_now
             WHERE "attendanceRecordId" = p_attendance_record_id;
        END IF;
        p_changed := TRUE;
    END IF;

    IF p_action_code = 'OUT' AND v_out IS NULL THEN
        IF v_in IS NULL THEN
            RAISE EXCEPTION 'Check-in is required before checkout.' USING ERRCODE = '52105';
        END IF;
        IF v_requires_out = FALSE THEN
            RAISE EXCEPTION 'Checkout is not required for this session.' USING ERRCODE = '52106';
        END IF;
        IF v_now < v_out_open OR v_now > v_out_close THEN
            RAISE EXCEPTION 'Outside checkout window.' USING ERRCODE = '52107';
        END IF;
        UPDATE "AttendanceRecords"
           SET "checkedOutAtUtc" = v_now, "lastChangedByUserId" = p_actor_user_id, "lastChangedAtUtc" = v_now
         WHERE "attendanceRecordId" = p_attendance_record_id;
        p_changed := TRUE;
    END IF;

    IF p_changed = TRUE THEN
        INSERT INTO "AttendanceLogs" (
            "attendanceRecordId", "actionCode", "oldCheckInAtUtc", "oldCheckOutAtUtc",
            "newCheckInAtUtc", "newCheckOutAtUtc", "oldIsExcused", "newIsExcused", "actorUserId"
        ) VALUES (
            p_attendance_record_id, CASE WHEN p_action_code = 'IN' THEN 'CHECK_IN' ELSE 'CHECK_OUT' END,
            v_in, v_out, CASE WHEN p_action_code = 'IN' THEN v_now ELSE v_in END, CASE WHEN p_action_code = 'OUT' THEN v_now ELSE v_out END,
            v_excused, v_excused, p_actor_user_id
        );
    END IF;
END;
$$;

-- 2. Generate Event Roster from Audience Rules
CREATE OR REPLACE PROCEDURE sp_event_roster_generate_from_audience_rules(
    p_event_id BIGINT,
    p_actor_user_id INT,
    INOUT p_new_registrations_count INT DEFAULT 0,
    INOUT p_new_participants_count INT DEFAULT 0
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_term_id BIGINT;
    v_event_status VARCHAR(20);
    v_rule RECORD;
    v_session RECORD;
    v_reg_count INT := 0;
    v_part_count INT := 0;
BEGIN
    SELECT "academicTermId", "eventStatusCode"
      INTO v_event_term_id, v_event_status
      FROM "Events"
     WHERE "eventId" = p_event_id;

    IF v_event_term_id IS NULL THEN
        RAISE EXCEPTION 'Event not found.' USING ERRCODE = '52300';
    END IF;

    FOR v_rule IN
        SELECT "eventAudienceRuleId", "audienceScopeCode", "academicProgramId", 
               "sectionId", "yearLevel", "studentId", "isRequired"
          FROM "EventAudienceRules"
         WHERE "eventId" = p_event_id
    LOOP
        WITH matched_students AS (
            SELECT DISTINCT se."studentEnrollmentId", se."studentId"
              FROM "StudentEnrollments" se
              JOIN "Students" st ON st."studentId" = se."studentId"
             WHERE se."academicTermId" = v_event_term_id
               AND se."enrollmentStatusCode" = 'ENROLLED'
               AND st."isActive" = TRUE
               AND (
                   (v_rule."audienceScopeCode" = 'ALL_STUDENTS')
                   OR (v_rule."audienceScopeCode" = 'PROGRAM' AND se."academicProgramId" = v_rule."academicProgramId")
                   OR (v_rule."audienceScopeCode" = 'YEAR_LEVEL' AND se."yearLevel" = v_rule."yearLevel")
                   OR (v_rule."audienceScopeCode" = 'SECTION' AND se."academicProgramId" = v_rule."academicProgramId" 
                                                               AND se."sectionId" = v_rule."sectionId" 
                                                               AND se."yearLevel" = v_rule."yearLevel")
                   OR (v_rule."audienceScopeCode" = 'STUDENT' AND se."studentId" = v_rule."studentId")
               )
        ),
        inserted_regs AS (
            INSERT INTO "EventRegistrations" (
                "eventId", "studentEnrollmentId", 
                "studentId", "isRequired", "registrationStatusCode", 
                "sourceAudienceRuleId", "registeredByUserId", "registeredAtUtc"
            )
            SELECT 
                p_event_id, ms."studentEnrollmentId",
                ms."studentId", v_rule."isRequired", 'ACTIVE',
                v_rule."eventAudienceRuleId", p_actor_user_id, clock_timestamp()
            FROM matched_students ms
            ON CONFLICT ("eventId", "studentId") DO NOTHING
            RETURNING "eventRegistrationId"
        )
        SELECT COUNT(*) INTO v_reg_count FROM inserted_regs;
        p_new_registrations_count := p_new_registrations_count + v_reg_count;
    END LOOP;

    FOR v_session IN 
        SELECT "eventSessionId" 
          FROM "EventSessions" 
         WHERE "eventId" = p_event_id AND "isClosed" = FALSE
    LOOP
        WITH inserted_parts AS (
            INSERT INTO "EventParticipants" (
                "eventSessionId", "studentId", "isRequired", 
                "addedByUserId", "addedAtUtc"
            )
            SELECT 
                v_session."eventSessionId", er."studentId", er."isRequired",
                p_actor_user_id, clock_timestamp()
            FROM "EventRegistrations" er
            WHERE er."eventId" = p_event_id
              AND er."registrationStatusCode" = 'ACTIVE'
            ON CONFLICT ("eventSessionId", "studentId") DO NOTHING
            RETURNING "eventParticipantId"
        )
        SELECT COUNT(*) INTO v_part_count FROM inserted_parts;
        p_new_participants_count := p_new_participants_count + v_part_count;
    END LOOP;
END;
$$;

-- 3. Issue or Re-issue Single Event QR Credential
CREATE OR REPLACE FUNCTION sp_event_qr_credential_issue(
    p_event_registration_id BIGINT,
    p_token_hash BYTEA,
    p_expires_at_utc TIMESTAMPTZ,
    p_actor_user_id INT
)
RETURNS TABLE (
    "eventParticipantQrCredentialId" BIGINT,
    "issuedAtUtc" TIMESTAMPTZ,
    "expiresAtUtc" TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_cred_id BIGINT;
    v_issued_at TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "Users" 
        WHERE "userId" = p_actor_user_id AND "isActive" = TRUE
    ) THEN
        RAISE EXCEPTION 'Actor is not authorized.' USING ERRCODE = '52101';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "EventRegistrations"
        WHERE "eventRegistrationId" = p_event_registration_id
          AND "registrationStatusCode" = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Active event registration required.' USING ERRCODE = '52302';
    END IF;

    UPDATE "EventParticipantQrCredentials"
       SET "revokedAtUtc" = v_issued_at,
           "revokedByUserId" = p_actor_user_id,
           "revocationReason" = 'Superseded by new QR credential issuance'
     WHERE "eventRegistrationId" = p_event_registration_id
       AND "revokedAtUtc" IS NULL;

    INSERT INTO "EventParticipantQrCredentials" (
        "eventRegistrationId", "tokenHash", "issuedByUserId",
        "issuedAtUtc", "expiresAtUtc"
    )
    VALUES (
        p_event_registration_id, p_token_hash, p_actor_user_id,
        v_issued_at, p_expires_at_utc
    )
    RETURNING "EventParticipantQrCredentials"."eventParticipantQrCredentialId"
      INTO v_cred_id;

    RETURN QUERY
    SELECT v_cred_id, v_issued_at, p_expires_at_utc;
END;
$$;

-- 4. Record Attendance by Event QR Scan Attempt (Audited)
CREATE OR REPLACE FUNCTION sp_attendance_record_by_event_qr(
    p_event_session_id BIGINT,
    p_token_hash BYTEA,
    p_action_code VARCHAR(3), -- 'IN' or 'OUT'
    p_device_fingerprint_hash BYTEA,
    p_actor_user_id INT
)
RETURNS TABLE (
    "scanResultCode" VARCHAR(20),
    "failureReasonCode" VARCHAR(40),
    "studentNumber" VARCHAR(50),
    "studentFullName" VARCHAR(200),
    "actionRecorded" VARCHAR(3),
    "recordedAtUtc" TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
    v_event_id BIGINT;
    v_in_open TIMESTAMPTZ; v_in_close TIMESTAMPTZ;
    v_out_open TIMESTAMPTZ; v_out_close TIMESTAMPTZ;
    v_req_out BOOLEAN; v_session_closed BOOLEAN;
    v_device_id BIGINT; v_device_status VARCHAR(12);
    v_reg_id BIGINT; v_student_id BIGINT; v_st_num VARCHAR(50); v_st_name VARCHAR(200);
    v_part_id BIGINT; v_rec_id BIGINT;
    v_in_time TIMESTAMPTZ; v_out_time TIMESTAMPTZ;
    v_is_excused BOOLEAN; v_excuse_reason VARCHAR(500);
    v_fail_code VARCHAR(40) := NULL;
BEGIN
    IF p_action_code NOT IN ('IN', 'OUT') THEN
        RAISE EXCEPTION 'Action code must be IN or OUT.' USING ERRCODE = '52100';
    END IF;

    IF p_device_fingerprint_hash IS NOT NULL THEN
        SELECT "attendanceDeviceId", "deviceStatusCode"
          INTO v_device_id, v_device_status
          FROM "AttendanceDevices"
         WHERE "deviceFingerprintHash" = p_device_fingerprint_hash;

        IF v_device_id IS NOT NULL AND v_device_status <> 'ACTIVE' THEN
            v_fail_code := 'DEVICE_' || v_device_status;
            INSERT INTO "AttendanceScanAttempts" (
                "eventSessionId", "attendanceDeviceId", "tokenHash",
                "actionCode", "scanResultCode", "failureReasonCode",
                "processedByUserId", "scannedAtUtc"
            ) VALUES (
                p_event_session_id, v_device_id, p_token_hash,
                p_action_code, 'REJECTED', v_fail_code, p_actor_user_id, v_now
            );
            RETURN QUERY SELECT 'REJECTED'::VARCHAR(20), v_fail_code, NULL::VARCHAR(50), NULL::VARCHAR(200), NULL::VARCHAR(3), v_now;
            RETURN;
        END IF;
    END IF;

    SELECT s."eventId", s."checkInOpensAtUtc", s."checkInClosesAtUtc",
           s."checkOutOpensAtUtc", s."checkOutClosesAtUtc", s."requiresCheckOut", s."isClosed"
      INTO v_event_id, v_in_open, v_in_close, v_out_open, v_out_close, v_req_out, v_session_closed
      FROM "EventSessions" s
      JOIN "Events" e ON e."eventId" = s."eventId"
     WHERE s."eventSessionId" = p_event_session_id
     FOR SHARE;

    IF v_event_id IS NULL OR v_session_closed = TRUE THEN
        v_fail_code := 'SESSION_CLOSED_OR_NOT_FOUND';
    END IF;

    IF v_fail_code IS NULL THEN
        SELECT c."eventRegistrationId", er."studentId", st."studentNumber", 
               (st."firstName" || ' ' || st."lastName") AS "fullName"
          INTO v_reg_id, v_student_id, v_st_num, v_st_name
          FROM "EventParticipantQrCredentials" c
          JOIN "EventRegistrations" er ON er."eventRegistrationId" = c."eventRegistrationId"
          JOIN "Students" st ON st."studentId" = er."studentId"
         WHERE c."tokenHash" = p_token_hash
           AND c."revokedAtUtc" IS NULL
           AND (c."expiresAtUtc" IS NULL OR c."expiresAtUtc" > v_now);

        IF v_reg_id IS NULL THEN
            v_fail_code := 'INVALID_OR_EXPIRED_TOKEN';
        END IF;
    END IF;

    IF v_fail_code IS NULL THEN
        SELECT "eventParticipantId"
          INTO v_part_id
          FROM "EventParticipants"
         WHERE "eventSessionId" = p_event_session_id 
           AND "studentId" = v_student_id
         FOR UPDATE;

        IF v_part_id IS NULL THEN
            v_fail_code := 'NOT_ON_SESSION_ROSTER';
        END IF;
    END IF;

    IF v_fail_code IS NULL THEN
        SELECT "attendanceRecordId", "checkedInAtUtc", "checkedOutAtUtc", "isExcused", "excuseReason"
          INTO v_rec_id, v_in_time, v_out_time, v_is_excused, v_excuse_reason
          FROM "AttendanceRecords"
         WHERE "eventParticipantId" = v_part_id
         FOR UPDATE;

        IF p_action_code = 'IN' THEN
            IF v_in_time IS NOT NULL THEN
                v_fail_code := 'ALREADY_CHECKED_IN';
            ELSIF v_now < v_in_open OR v_now > v_in_close THEN
                v_fail_code := 'OUTSIDE_CHECKIN_WINDOW';
            END IF;
        ELSIF p_action_code = 'OUT' THEN
            IF v_in_time IS NULL THEN
                v_fail_code := 'CHECKIN_REQUIRED_FIRST';
            ELSIF v_out_time IS NOT NULL THEN
                v_fail_code := 'ALREADY_CHECKED_OUT';
            ELSIF v_req_out = FALSE THEN
                v_fail_code := 'CHECKOUT_NOT_REQUIRED';
            ELSIF v_now < v_out_open OR v_now > v_out_close THEN
                v_fail_code := 'OUTSIDE_CHECKOUT_WINDOW';
            END IF;
        END IF;
    END IF;

    IF v_fail_code IS NOT NULL THEN
        INSERT INTO "AttendanceScanAttempts" (
            "eventSessionId", "eventRegistrationId", "eventParticipantId",
            "attendanceDeviceId", "tokenHash", "actionCode", "scanResultCode",
            "failureReasonCode", "processedByUserId", "scannedAtUtc"
        ) VALUES (
            p_event_session_id, v_reg_id, v_part_id, v_device_id, p_token_hash,
            p_action_code, 'REJECTED', v_fail_code, p_actor_user_id, v_now
        );

        RETURN QUERY SELECT 'REJECTED'::VARCHAR(20), v_fail_code, v_st_num, v_st_name, NULL::VARCHAR(3), v_now;
        RETURN;
    END IF;

    IF p_action_code = 'IN' THEN
        IF v_rec_id IS NULL THEN
            INSERT INTO "AttendanceRecords" (
                "eventParticipantId", "checkedInAtUtc", 
                "lastChangedByUserId", "lastChangedAtUtc"
            ) VALUES (
                v_part_id, v_now, p_actor_user_id, v_now
            ) RETURNING "attendanceRecordId" INTO v_rec_id;
        ELSE
            UPDATE "AttendanceRecords"
               SET "checkedInAtUtc" = v_now,
                   "lastChangedByUserId" = p_actor_user_id,
                   "lastChangedAtUtc" = v_now
             WHERE "attendanceRecordId" = v_rec_id;
        END IF;

        INSERT INTO "AttendanceLogs" (
            "attendanceRecordId", "actionCode", "oldCheckInAtUtc",
            "oldCheckOutAtUtc", "newCheckInAtUtc", "newCheckOutAtUtc",
            "oldIsExcused", "newIsExcused", "actorUserId"
        ) VALUES (
            v_rec_id, 'CHECK_IN', NULL, NULL, v_now, NULL,
            v_is_excused, v_is_excused, p_actor_user_id
        );

    ELSIF p_action_code = 'OUT' THEN
        UPDATE "AttendanceRecords"
           SET "checkedOutAtUtc" = v_now,
               "lastChangedByUserId" = p_actor_user_id,
               "lastChangedAtUtc" = v_now
         WHERE "attendanceRecordId" = v_rec_id;

        INSERT INTO "AttendanceLogs" (
            "attendanceRecordId", "actionCode", "oldCheckInAtUtc",
            "oldCheckOutAtUtc", "newCheckInAtUtc", "newCheckOutAtUtc",
            "oldIsExcused", "newIsExcused", "actorUserId"
        ) VALUES (
            v_rec_id, 'CHECK_OUT', v_in_time, NULL, v_in_time, v_now,
            v_is_excused, v_is_excused, p_actor_user_id
        );
    END IF;

    INSERT INTO "AttendanceScanAttempts" (
        "eventSessionId", "eventRegistrationId", "eventParticipantId",
        "attendanceDeviceId", "tokenHash", "actionCode", "scanResultCode",
        "failureReasonCode", "processedByUserId", "scannedAtUtc"
    ) VALUES (
        p_event_session_id, v_reg_id, v_part_id, v_device_id, p_token_hash,
        p_action_code, 'ACCEPTED', NULL, p_actor_user_id, v_now
    );

    RETURN QUERY SELECT 'ACCEPTED'::VARCHAR(20), NULL::VARCHAR(40), v_st_num, v_st_name, p_action_code, v_now;
END;
$$;

-- 5. Create Event Fine Policy from Template
CREATE OR REPLACE FUNCTION sp_event_fine_policy_create_from_template(
    p_event_id BIGINT,
    p_fine_policy_template_version_id BIGINT,
    p_policy_code VARCHAR(50),
    p_policy_name VARCHAR(200),
    p_actor_user_id INT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_currency VARCHAR(3);
    v_max_fine NUMERIC(12,2);
    v_policy_id BIGINT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "Events" WHERE "eventId" = p_event_id AND "eventStatusCode" = 'DRAFT') THEN
        RAISE EXCEPTION 'A draft event was not found.' USING ERRCODE = '53303';
    END IF;

    IF EXISTS (SELECT 1 FROM "EventFinePolicies" WHERE "eventId" = p_event_id) THEN
        RAISE EXCEPTION 'This event already has a fine policy.' USING ERRCODE = '53304';
    END IF;

    SELECT "currencyCode", "maximumFinePerStudent"
      INTO v_currency, v_max_fine
      FROM "FinePolicyTemplateVersions"
     WHERE "finePolicyTemplateVersionId" = p_fine_policy_template_version_id
       AND "versionStatusCode" = 'PUBLISHED';

    IF v_currency IS NULL THEN
        RAISE EXCEPTION 'Published template version was not found.' USING ERRCODE = '53305';
    END IF;

    INSERT INTO "EventFinePolicies" (
        "eventId", "sourceFinePolicyTemplateVersionId",
        "policyCode", "policyName", "currencyCode", "maximumFinePerStudent",
        "policyStatusCode", "createdByUserId"
    ) VALUES (
        p_event_id, p_fine_policy_template_version_id,
        p_policy_code, p_policy_name, v_currency, v_max_fine,
        'DRAFT', p_actor_user_id
    ) RETURNING "eventFinePolicyId" INTO v_policy_id;

    WITH candidate_rules AS (
        SELECT 
            s."eventSessionId",
            r."finePolicyTemplateRuleId",
            r."violationCode",
            r."fineAmount",
            r."priorityOrder",
            ROW_NUMBER() OVER (
                PARTITION BY s."eventSessionId", r."violationCode"
                ORDER BY CASE WHEN r."sessionTypeCode" = s."sessionTypeCode" THEN 0 ELSE 1 END, r."priorityOrder"
            ) AS "choiceOrder"
        FROM "EventSessions" s
        JOIN "FinePolicyTemplateRules" r 
          ON r."finePolicyTemplateVersionId" = p_fine_policy_template_version_id
         AND r."isActive" = TRUE
         AND r."sessionTypeCode" IN ('GENERAL', s."sessionTypeCode")
        WHERE s."eventId" = p_event_id
    )
    INSERT INTO "EventFineRules" (
        "eventFinePolicyId", "eventId", "eventSessionId", "sourceFinePolicyTemplateRuleId",
        "violationCode", "fineAmount", "priorityOrder", "isActive"
    )
    SELECT 
        v_policy_id, p_event_id, c."eventSessionId", c."finePolicyTemplateRuleId",
        c."violationCode", c."fineAmount", c."priorityOrder", TRUE
    FROM candidate_rules c
    WHERE c."choiceOrder" = 1;

    RETURN v_policy_id;
END;
$$;

-- 6. Assess Fines for Closed Event Session
CREATE OR REPLACE PROCEDURE sp_student_fine_assess_closed_session(
    p_event_session_id BIGINT,
    p_actor_user_id INT,
    INOUT p_assessments_created INT DEFAULT 0,
    INOUT p_total_amount_assessed NUMERIC(12,2) DEFAULT 0.00
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_event_id BIGINT;
    v_policy_id BIGINT;
    v_is_closed BOOLEAN;
    v_requires_out BOOLEAN;
    v_currency VARCHAR(3);
    v_part RECORD;
    v_violation VARCHAR(30);
    v_fine_amount NUMERIC(12,2);
    v_assessment_id BIGINT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT s."eventId", s."isClosed", s."requiresCheckOut", efp."eventFinePolicyId", efp."currencyCode"
      INTO v_event_id, v_is_closed, v_requires_out, v_policy_id, v_currency
      FROM "EventSessions" s
      JOIN "EventFinePolicies" efp ON efp."eventId" = s."eventId"
     WHERE s."eventSessionId" = p_event_session_id
       AND efp."policyStatusCode" = 'ACTIVE'
     FOR SHARE;

    IF v_is_closed IS NULL OR v_is_closed = FALSE THEN
        RAISE EXCEPTION 'Session must be closed before assessing fines.' USING ERRCODE = '53300';
    END IF;

    IF v_policy_id IS NULL THEN
        RAISE EXCEPTION 'No active event fine policy found for this session.' USING ERRCODE = '53301';
    END IF;

    FOR v_part IN
        SELECT p."eventParticipantId", p."studentId", p."isRequired",
               ar."checkedInAtUtc", ar."checkedOutAtUtc", 
               COALESCE(ar."isExcused", FALSE) AS "isExcused"
          FROM "EventParticipants" p
          LEFT JOIN "AttendanceRecords" ar ON ar."eventParticipantId" = p."eventParticipantId"
         WHERE p."eventSessionId" = p_event_session_id
    LOOP
        IF v_part."isRequired" = FALSE OR v_part."isExcused" = TRUE THEN
            CONTINUE;
        END IF;

        v_violation := NULL;
        IF v_part."checkedInAtUtc" IS NULL THEN
            v_violation := 'ABSENT';
        ELSIF v_requires_out = TRUE AND v_part."checkedOutAtUtc" IS NULL THEN
            v_violation := 'MISSED_CHECKOUT';
        END IF;

        IF v_violation IS NOT NULL THEN
            SELECT COALESCE(o."fineAmount", r."fineAmount") AS amount
              INTO v_fine_amount
              FROM "EventFineRules" r
              LEFT JOIN "EventFineRuleOverrides" o ON o."eventFineRuleId" = r."eventFineRuleId"
             WHERE r."eventFinePolicyId" = v_policy_id
               AND r."eventSessionId" = p_event_session_id
               AND r."violationCode" = v_violation
               AND r."isActive" = TRUE;

            IF v_fine_amount IS NOT NULL AND v_fine_amount > 0 THEN
                INSERT INTO "StudentFineAssessments" (
                    "eventParticipantId", "eventSessionId",
                    "violationCode", "assessedAmount", "currencyCode",
                    "assessmentStatusCode", "assessedByUserId", "assessedAtUtc"
                )
                VALUES (
                    v_part."eventParticipantId", p_event_session_id,
                    v_violation, v_fine_amount, v_currency,
                    'ASSESSED', p_actor_user_id, v_now
                )
                ON CONFLICT ("eventParticipantId", "violationCode") DO NOTHING
                RETURNING "studentFineAssessmentId" INTO v_assessment_id;

                IF v_assessment_id IS NOT NULL THEN
                    INSERT INTO "StudentFineStatusHistory" (
                        "studentFineAssessmentId", "fromStatusCode",
                        "toStatusCode", "changeReason", "changedByUserId", "changedAtUtc"
                    ) VALUES (
                        v_assessment_id, NULL, 'ASSESSED',
                        'Automatic fine assessment on session close', p_actor_user_id, v_now
                    );

                    p_assessments_created := p_assessments_created + 1;
                    p_total_amount_assessed := p_total_amount_assessed + v_fine_amount;
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- 7. Fine Waiver Management
CREATE OR REPLACE FUNCTION sp_fine_waiver_request(
    p_student_fine_assessment_id BIGINT,
    p_waiver_reason VARCHAR(1000),
    p_requested_by_user_id INT
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_waiver_id BIGINT;
    v_status VARCHAR(20);
BEGIN
    SELECT "assessmentStatusCode" INTO v_status
      FROM "StudentFineAssessments"
     WHERE "studentFineAssessmentId" = p_student_fine_assessment_id
     FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Fine assessment not found.' USING ERRCODE = '53400';
    END IF;

    IF v_status IN ('WAIVED', 'PAID', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot request waiver for assessment with status %.', v_status USING ERRCODE = '53401';
    END IF;

    INSERT INTO "FineWaiverRequests" (
        "studentFineAssessmentId", "waiverReason",
        "requestStatusCode", "requestedByUserId", "requestedAtUtc"
    ) VALUES (
        p_student_fine_assessment_id, p_waiver_reason,
        'PENDING', p_requested_by_user_id, clock_timestamp()
    ) RETURNING "fineWaiverRequestId" INTO v_waiver_id;

    RETURN v_waiver_id;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_fine_waiver_review(
    p_fine_waiver_request_id BIGINT,
    p_decision VARCHAR(20), -- 'APPROVED' or 'REJECTED'
    p_review_notes VARCHAR(1000),
    p_reviewer_user_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_assessment_id BIGINT;
    v_curr_req_status VARCHAR(20);
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'Decision must be APPROVED or REJECTED.' USING ERRCODE = '53402';
    END IF;

    SELECT "studentFineAssessmentId", "requestStatusCode"
      INTO v_assessment_id, v_curr_req_status
      FROM "FineWaiverRequests"
     WHERE "fineWaiverRequestId" = p_fine_waiver_request_id
     FOR UPDATE;

    IF v_curr_req_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Waiver request is already resolved.' USING ERRCODE = '53403';
    END IF;

    UPDATE "FineWaiverRequests"
       SET "requestStatusCode" = p_decision,
           "reviewedByUserId" = p_reviewer_user_id,
           "reviewedAtUtc" = v_now,
           "reviewNotes" = p_review_notes
     WHERE "fineWaiverRequestId" = p_fine_waiver_request_id;

    IF p_decision = 'APPROVED' THEN
        UPDATE "StudentFineAssessments"
           SET "assessmentStatusCode" = 'WAIVED'
         WHERE "studentFineAssessmentId" = v_assessment_id;

        INSERT INTO "StudentFineStatusHistory" (
            "studentFineAssessmentId", "fromStatusCode",
            "toStatusCode", "changeReason", "changedByUserId", "changedAtUtc"
        ) VALUES (
            v_assessment_id, 'ASSESSED', 'WAIVED',
            'Fine waiver approved: ' || p_review_notes, p_reviewer_user_id, v_now
        );
    END IF;
END;
$$;

-- 8. Fine Payments & Voiding
CREATE OR REPLACE FUNCTION sp_fine_payment_post(
    p_payment_reference VARCHAR(100),
    p_payment_method_code VARCHAR(30),
    p_total_amount NUMERIC(12,2),
    p_received_by_user_id INT,
    p_external_payment_reference VARCHAR(100),
    p_allocations JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_payment_id BIGINT;
    v_alloc_sum NUMERIC(12,2) := 0.00;
    v_elem JSONB;
    v_assessment_id BIGINT;
    v_alloc_amount NUMERIC(12,2);
    v_assessed_amount NUMERIC(12,2);
    v_already_paid NUMERIC(12,2);
    v_outstanding NUMERIC(12,2);
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF p_total_amount <= 0 THEN
        RAISE EXCEPTION 'Total payment amount must be greater than zero.' USING ERRCODE = '53500';
    END IF;

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_alloc_sum := v_alloc_sum + (v_elem->>'amount')::NUMERIC(12,2);
    END LOOP;

    IF v_alloc_sum <> p_total_amount THEN
        RAISE EXCEPTION 'Allocations sum (%) does not equal total payment amount (%).', v_alloc_sum, p_total_amount USING ERRCODE = '53501';
    END IF;

    INSERT INTO "FinePayments" (
        "paymentReference", "paymentMethodCode", "totalAmount",
        "paymentStatusCode", "receivedByUserId", "receivedAtUtc",
        "externalPaymentReference"
    ) VALUES (
        p_payment_reference, p_payment_method_code, p_total_amount,
        'CONFIRMED', p_received_by_user_id, v_now, p_external_payment_reference
    ) RETURNING "finePaymentId" INTO v_payment_id;

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
        v_assessment_id := (v_elem->>'assessment_id')::BIGINT;
        v_alloc_amount := (v_elem->>'amount')::NUMERIC(12,2);

        SELECT "assessedAmount" INTO v_assessed_amount
          FROM "StudentFineAssessments"
         WHERE "studentFineAssessmentId" = v_assessment_id
         FOR UPDATE;

        IF v_assessed_amount IS NULL THEN
            RAISE EXCEPTION 'Assessment % not found.', v_assessment_id USING ERRCODE = '53502';
        END IF;

        SELECT COALESCE(SUM(pa."allocatedAmount"), 0.00)
          INTO v_already_paid
          FROM "FinePaymentAllocations" pa
          JOIN "FinePayments" fp ON fp."finePaymentId" = pa."finePaymentId"
         WHERE pa."studentFineAssessmentId" = v_assessment_id
           AND fp."paymentStatusCode" = 'CONFIRMED';

        v_outstanding := v_assessed_amount - v_already_paid;
        IF v_alloc_amount > v_outstanding THEN
            RAISE EXCEPTION 'Allocation amount (%) exceeds outstanding fine balance (%) for assessment %.',
                v_alloc_amount, v_outstanding, v_assessment_id USING ERRCODE = '53503';
        END IF;

        INSERT INTO "FinePaymentAllocations" (
            "finePaymentId", "studentFineAssessmentId",
            "allocatedAmount", "allocatedAtUtc"
        ) VALUES (
            v_payment_id, v_assessment_id, v_alloc_amount, v_now
        );

        IF (v_already_paid + v_alloc_amount) >= v_assessed_amount THEN
            UPDATE "StudentFineAssessments"
               SET "assessmentStatusCode" = 'PAID'
             WHERE "studentFineAssessmentId" = v_assessment_id;

            INSERT INTO "StudentFineStatusHistory" (
                "studentFineAssessmentId", "fromStatusCode",
                "toStatusCode", "changeReason", "changedByUserId", "changedAtUtc"
            ) VALUES (
                v_assessment_id, 'ASSESSED', 'PAID',
                'Paid in full via payment ' || p_payment_reference, p_received_by_user_id, v_now
            );
        ELSE
            UPDATE "StudentFineAssessments"
               SET "assessmentStatusCode" = 'PARTIALLY_PAID'
             WHERE "studentFineAssessmentId" = v_assessment_id;
        END IF;
    END LOOP;

    RETURN v_payment_id;
END;
$$;

CREATE OR REPLACE PROCEDURE sp_fine_payment_void(
    p_fine_payment_id BIGINT,
    p_void_reason VARCHAR(1000),
    p_voided_by_user_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_status VARCHAR(20);
    v_alloc RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    SELECT "paymentStatusCode" INTO v_status
      FROM "FinePayments"
     WHERE "finePaymentId" = p_fine_payment_id
     FOR UPDATE;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Payment not found.' USING ERRCODE = '53504';
    END IF;

    IF v_status = 'VOIDED' THEN
        RAISE EXCEPTION 'Payment is already voided.' USING ERRCODE = '53505';
    END IF;

    UPDATE "FinePayments"
       SET "paymentStatusCode" = 'VOIDED',
           "voidedByUserId" = p_voided_by_user_id,
           "voidedAtUtc" = v_now,
           "voidReason" = p_void_reason
     WHERE "finePaymentId" = p_fine_payment_id;

    FOR v_alloc IN
        SELECT "studentFineAssessmentId"
          FROM "FinePaymentAllocations"
         WHERE "finePaymentId" = p_fine_payment_id
    LOOP
        UPDATE "StudentFineAssessments"
           SET "assessmentStatusCode" = 'ASSESSED'
         WHERE "studentFineAssessmentId" = v_alloc."studentFineAssessmentId"
           AND "assessmentStatusCode" IN ('PAID', 'PARTIALLY_PAID');

        INSERT INTO "StudentFineStatusHistory" (
            "studentFineAssessmentId", "fromStatusCode",
            "toStatusCode", "changeReason", "changedByUserId", "changedAtUtc"
        ) VALUES (
            v_alloc."studentFineAssessmentId", 'PAID', 'ASSESSED',
            'Payment voided: ' || p_void_reason, p_voided_by_user_id, v_now
        );
    END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. SERVICE ROLE & SECURITY
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attendance_service') THEN
        CREATE ROLE attendance_service;
    END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ssc TO attendance_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ssc TO attendance_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ssc TO attendance_service;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA ssc TO attendance_service;

