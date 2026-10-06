--
-- PostgreSQL database dump
--

\restrict 3x30pQnW3bWwueZQmud9eXsmP70ksYBWlJ37VbdBykjJ0r25r3bs9DhnlwGpRKh

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ssc; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA ssc;


--
-- Name: bump_row_version(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.bump_row_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
     BEGIN
       NEW."rowVersion" := new_row_version();
       RETURN NEW;
     END;
     $$;


--
-- Name: fn_attendance_self_scan_event_qr(bytea, integer, uuid, bytea, inet); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.fn_attendance_self_scan_event_qr(p_token_hash bytea, p_authenticated_user_id integer, p_client_request_id uuid, p_client_fingerprint_hash bytea DEFAULT NULL::bytea, p_ip_address inet DEFAULT NULL::inet) RETURNS TABLE("scanResultCode" character varying, "failureReasonCode" character varying, "eventId" bigint, "eventName" character varying, "eventSessionId" bigint, "sessionName" character varying, "studentId" bigint, "studentNumber" character varying, "studentFullName" character varying, "actionRecorded" character varying, "attendanceStatus" character varying, "recordedAtUtc" timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
    DECLARE
        v_now TIMESTAMPTZ := clock_timestamp(); v_existing RECORD; v_qr_id BIGINT; v_qr_action VARCHAR(4);
        v_valid_from TIMESTAMPTZ; v_expires_at TIMESTAMPTZ; v_revoked_at TIMESTAMPTZ; v_event_id BIGINT;
        v_event_name VARCHAR(200); v_event_status VARCHAR(20); v_session_id BIGINT; v_session_name VARCHAR(100);
        v_session_closed BOOLEAN; v_in_open TIMESTAMPTZ; v_in_close TIMESTAMPTZ; v_late_after TIMESTAMPTZ;
        v_out_open TIMESTAMPTZ; v_out_close TIMESTAMPTZ; v_requires_out BOOLEAN; v_minimum_minutes SMALLINT;
        v_student_id BIGINT; v_student_number VARCHAR(50); v_student_name VARCHAR(320); v_participant_id BIGINT;
        v_attendance_record_id BIGINT; v_checked_in TIMESTAMPTZ; v_checked_out TIMESTAMPTZ; v_is_excused BOOLEAN;
        v_excuse_reason VARCHAR(500); v_action VARCHAR(3); v_result VARCHAR(20) := 'REJECTED'; v_reason VARCHAR(40);
        v_attendance_status VARCHAR(30); v_effective_at TIMESTAMPTZ;
    BEGIN
        IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'clientRequestId is required.' USING ERRCODE = '22004'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 847291));
        SELECT a.* INTO v_existing FROM "AttendanceScanAttempts" a WHERE a."clientRequestId" = p_client_request_id;
        IF FOUND THEN
            RETURN QUERY SELECT v_existing."scanResultCode"::VARCHAR(20), v_existing."failureReasonCode"::VARCHAR(40),
                e."eventId", e."eventName", s."eventSessionId", s."sessionName", st."studentId", st."studentNumber",
                concat_ws(' ', st."firstName", st."middleName", st."lastName", st.suffix)::VARCHAR(320),
                v_existing."actionCode"::VARCHAR(3), v_existing."attendanceStatusCode"::VARCHAR(30),
                COALESCE(v_existing."attendanceEffectiveAtUtc", v_existing."scannedAtUtc")
            FROM (SELECT 1) seed
            LEFT JOIN "EventSessions" s ON s."eventSessionId" = v_existing."eventSessionId"
            LEFT JOIN "Events" e ON e."eventId" = s."eventId"
            LEFT JOIN "Students" st ON st."studentId" = v_existing."resolvedStudentId";
            RETURN;
        END IF;

        SELECT q."eventSessionQrTokenId", q."actionCode", q."validFromUtc", q."expiresAtUtc", q."revokedAtUtc",
            s."eventSessionId", s."sessionName", s."isClosed", s."checkInOpensAtUtc", s."checkInClosesAtUtc", s."lateAfterUtc",
            s."checkOutOpensAtUtc", s."checkOutClosesAtUtc", s."requiresCheckOut", s."minimumMinutes",
            e."eventId", e."eventName", e."eventStatusCode"
        INTO v_qr_id, v_qr_action, v_valid_from, v_expires_at, v_revoked_at, v_session_id, v_session_name, v_session_closed,
            v_in_open, v_in_close, v_late_after, v_out_open, v_out_close, v_requires_out, v_minimum_minutes,
            v_event_id, v_event_name, v_event_status
        FROM "EventSessionQrTokens" q JOIN "EventSessions" s ON s."eventSessionId" = q."eventSessionId" JOIN "Events" e ON e."eventId" = s."eventId"
        WHERE q."tokenHash" = p_token_hash;

        IF NOT FOUND THEN v_reason := 'INVALID_QR_TOKEN';
        ELSIF v_revoked_at IS NOT NULL THEN v_reason := 'REVOKED_QR_TOKEN';
        ELSIF v_now < v_valid_from THEN v_reason := 'QR_NOT_YET_VALID';
        ELSIF v_now >= v_expires_at THEN v_reason := 'EXPIRED_QR_TOKEN';
        ELSIF v_event_status = 'CANCELLED' THEN v_reason := 'EVENT_CANCELLED';
        ELSIF v_event_status <> 'PUBLISHED' THEN v_reason := 'EVENT_NOT_PUBLISHED';
        ELSIF v_session_closed THEN v_reason := 'SESSION_CLOSED';
        END IF;

        IF v_reason IS NULL THEN
            SELECT st."studentId", st."studentNumber", concat_ws(' ', st."firstName", st."middleName", st."lastName", st.suffix)
            INTO v_student_id, v_student_number, v_student_name
            FROM "StudentUserLinks" sul JOIN "Users" u ON u."userId" = sul."userId" JOIN "Students" st ON st."studentId" = sul."studentId"
            WHERE sul."userId" = p_authenticated_user_id AND u."isActive" = TRUE AND st."isActive" = TRUE;
            IF NOT FOUND THEN v_reason := 'STUDENT_ACCOUNT_NOT_LINKED'; END IF;
        END IF;

        IF v_reason IS NULL THEN
            SELECT ep."eventParticipantId" INTO v_participant_id FROM "EventParticipants" ep WHERE ep."eventSessionId" = v_session_id AND ep."studentId" = v_student_id FOR UPDATE;
            IF NOT FOUND THEN v_reason := 'NOT_ON_SESSION_ROSTER'; END IF;
        END IF;

        IF v_reason IS NULL THEN
            SELECT ar."attendanceRecordId", ar."checkedInAtUtc", ar."checkedOutAtUtc", ar."isExcused", ar."excuseReason"
            INTO v_attendance_record_id, v_checked_in, v_checked_out, v_is_excused, v_excuse_reason
            FROM "AttendanceRecords" ar WHERE ar."eventParticipantId" = v_participant_id;

            IF v_qr_action = 'AUTO' THEN
                IF v_checked_in IS NULL THEN v_action := 'IN';
                ELSIF v_requires_out AND v_checked_out IS NULL AND v_out_open IS NOT NULL AND v_now >= v_out_open THEN v_action := 'OUT';
                ELSE v_action := 'IN'; END IF;
            ELSE v_action := v_qr_action::VARCHAR(3); END IF;

            IF v_action = 'IN' THEN
                IF v_checked_in IS NOT NULL THEN v_result := 'NO_CHANGE'; v_reason := 'ALREADY_CHECKED_IN'; v_effective_at := v_checked_in;
                ELSE
                    IF v_attendance_record_id IS NULL THEN
                        INSERT INTO "AttendanceRecords" ("eventParticipantId", "checkedInAtUtc", "lastChangedByUserId", "lastChangedAtUtc")
                        VALUES (v_participant_id, v_now, p_authenticated_user_id, v_now) RETURNING "attendanceRecordId" INTO v_attendance_record_id;
                        v_is_excused := FALSE;
                    ELSE
                        UPDATE "AttendanceRecords" SET "checkedInAtUtc" = v_now, "lastChangedByUserId" = p_authenticated_user_id, "lastChangedAtUtc" = v_now WHERE "attendanceRecordId" = v_attendance_record_id;
                    END IF;
                    INSERT INTO "AttendanceLogs" ("attendanceRecordId", "actionCode", "oldCheckInAtUtc", "oldCheckOutAtUtc", "newCheckInAtUtc", "newCheckOutAtUtc", "oldIsExcused", "newIsExcused", "actorUserId")
                    VALUES (v_attendance_record_id, 'CHECK_IN', v_checked_in, v_checked_out, v_now, v_checked_out, v_is_excused, v_is_excused, p_authenticated_user_id);
                    v_checked_in := v_now; v_result := 'ACCEPTED'; v_effective_at := v_now;
                END IF;
            ELSIF v_action = 'OUT' THEN
                IF v_checked_in IS NULL THEN v_reason := 'CHECKIN_REQUIRED_FIRST';
                ELSIF v_checked_out IS NOT NULL THEN v_result := 'NO_CHANGE'; v_reason := 'ALREADY_CHECKED_OUT'; v_effective_at := v_checked_out;
                ELSIF v_requires_out = FALSE THEN v_reason := 'CHECKOUT_NOT_REQUIRED';
                ELSIF v_now < v_out_open OR v_now > v_out_close THEN v_reason := 'OUTSIDE_CHECKOUT_WINDOW';
                ELSE
                    UPDATE "AttendanceRecords" SET "checkedOutAtUtc" = v_now, "lastChangedByUserId" = p_authenticated_user_id, "lastChangedAtUtc" = v_now WHERE "attendanceRecordId" = v_attendance_record_id;
                    INSERT INTO "AttendanceLogs" ("attendanceRecordId", "actionCode", "oldCheckInAtUtc", "oldCheckOutAtUtc", "newCheckInAtUtc", "newCheckOutAtUtc", "oldIsExcused", "newIsExcused", "actorUserId")
                    VALUES (v_attendance_record_id, 'CHECK_OUT', v_checked_in, v_checked_out, v_checked_in, v_now, v_is_excused, v_is_excused, p_authenticated_user_id);
                    v_checked_out := v_now; v_result := 'ACCEPTED'; v_effective_at := v_now;
                END IF;
            END IF;
            IF v_result = 'ACCEPTED' AND v_qr_id IS NOT NULL THEN
                UPDATE "EventSessionQrTokens" SET "revokedAtUtc" = v_now, "revokedByUserId" = p_authenticated_user_id, "revocationReason" = 'Single-use self-scan' WHERE "eventSessionQrTokenId" = v_qr_id AND "revokedAtUtc" IS NULL;
            END IF;
        END IF;

        IF v_participant_id IS NOT NULL AND v_checked_in IS NOT NULL THEN
            SELECT va."attendanceStatus"::VARCHAR(30) INTO v_attendance_status FROM "VwEventAttendance" va WHERE va."eventParticipantId" = v_participant_id;
        END IF;

        INSERT INTO "AttendanceScanAttempts" (
            "eventSessionId", "eventRegistrationId", "eventParticipantId", "attendanceDeviceId", "tokenHash", "actionCode",
            "scanResultCode", "failureReasonCode", "processedByUserId", "scannedAtUtc", "eventSessionQrTokenId", "resolvedStudentId",
            "scanMethodCode", "clientRequestId", "clientFingerprintHash", "ipAddress", "attendanceStatusCode", "attendanceEffectiveAtUtc"
        ) VALUES (
            v_session_id, NULL, v_participant_id, NULL, p_token_hash, v_action,
            v_result, v_reason, p_authenticated_user_id, v_now, v_qr_id, v_student_id,
            'STUDENT_SCANNED_EVENT_QR', p_client_request_id, p_client_fingerprint_hash, p_ip_address,
            v_attendance_status, v_effective_at
        );

        RETURN QUERY SELECT v_result, v_reason, v_event_id, v_event_name, v_session_id, v_session_name,
            v_student_id, v_student_number, v_student_name, v_action, v_attendance_status, COALESCE(v_effective_at, v_now);
    END $$;


--
-- Name: fn_event_session_qr_issue(bigint, character varying, bytea, integer, integer, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.fn_event_session_qr_issue(p_event_session_id bigint, p_action_code character varying, p_token_hash bytea, p_valid_for_seconds integer, p_overlap_seconds integer, p_actor_user_id integer) RETURNS TABLE("eventSessionQrTokenId" bigint, "eventSessionId" bigint, "actionCode" character varying, "validFromUtc" timestamp with time zone, "expiresAtUtc" timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
    DECLARE v_now TIMESTAMPTZ := clock_timestamp(); v_token_id BIGINT; v_event_status VARCHAR(20); v_session_closed BOOLEAN;
    BEGIN
        IF p_action_code NOT IN ('IN', 'OUT', 'AUTO') THEN RAISE EXCEPTION 'Action code must be IN, OUT, or AUTO.' USING ERRCODE = '22023'; END IF;
        IF p_valid_for_seconds NOT BETWEEN 15 AND 3600 THEN RAISE EXCEPTION 'QR validity must be between 15 and 3600 seconds.' USING ERRCODE = '22023'; END IF;
        IF p_overlap_seconds NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'QR overlap must be between 0 and 30 seconds.' USING ERRCODE = '22023'; END IF;
        IF NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."userId" = p_actor_user_id AND u."isActive" = TRUE AND u."canManageAttendance" = TRUE) THEN RAISE EXCEPTION 'Active attendance manager authorization required.' USING ERRCODE = '42501'; END IF;
        SELECT e."eventStatusCode", s."isClosed" INTO v_event_status, v_session_closed FROM "EventSessions" s JOIN "Events" e ON e."eventId" = s."eventId" WHERE s."eventSessionId" = p_event_session_id FOR UPDATE OF s;
        IF NOT FOUND THEN RAISE EXCEPTION 'Event session not found.' USING ERRCODE = 'P0002'; END IF;
        IF v_event_status <> 'PUBLISHED' OR v_session_closed THEN RAISE EXCEPTION 'QR issuance requires a published event and open session.' USING ERRCODE = '55000'; END IF;
        UPDATE "EventSessionQrTokens" q SET "expiresAtUtc" = LEAST(q."expiresAtUtc", v_now + make_interval(secs => p_overlap_seconds)) WHERE q."eventSessionId" = p_event_session_id AND q."actionCode" = p_action_code AND q."revokedAtUtc" IS NULL AND q."expiresAtUtc" > v_now + make_interval(secs => p_overlap_seconds);
        INSERT INTO "EventSessionQrTokens" ("eventSessionId", "actionCode", "tokenHash", "validFromUtc", "expiresAtUtc", "issuedByUserId", "issuedAtUtc") VALUES (p_event_session_id, p_action_code, p_token_hash, v_now, v_now + make_interval(secs => p_valid_for_seconds), p_actor_user_id, v_now) RETURNING "EventSessionQrTokens"."eventSessionQrTokenId" INTO v_token_id;
        RETURN QUERY SELECT v_token_id, p_event_session_id, p_action_code, v_now, v_now + make_interval(secs => p_valid_for_seconds);
    END $$;


--
-- Name: fn_tr_academic_terms_dates(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.fn_tr_academic_terms_dates() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: fn_tr_attendance_logs_append_only(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.fn_tr_attendance_logs_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'Attendance logs are append-only.' USING ERRCODE = '52515';
END;
$$;


--
-- Name: fn_tr_events_lifecycle(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.fn_tr_events_lifecycle() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: fn_tr_student_enrollments_history(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.fn_tr_student_enrollments_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: new_row_version(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.new_row_version() RETURNS bytea
    LANGUAGE sql
    AS $$
       SELECT decode(substr(md5(random()::text || clock_timestamp()::text), 1, 16), 'hex')
     $$;


--
-- Name: sp_attendance_record(bigint, character varying, character varying, integer, boolean, bigint); Type: PROCEDURE; Schema: ssc; Owner: -
--

CREATE PROCEDURE ssc.sp_attendance_record(IN p_event_session_id bigint, IN p_student_number character varying, IN p_action_code character varying, IN p_actor_user_id integer, INOUT p_changed boolean DEFAULT false, INOUT p_attendance_record_id bigint DEFAULT NULL::bigint)
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


--
-- Name: sp_attendance_record_by_event_qr(bigint, bytea, character varying, bytea, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.sp_attendance_record_by_event_qr(p_event_session_id bigint, p_token_hash bytea, p_action_code character varying, p_device_fingerprint_hash bytea, p_actor_user_id integer) RETURNS TABLE("scanResultCode" character varying, "failureReasonCode" character varying, "studentNumber" character varying, "studentFullName" character varying, "actionRecorded" character varying, "recordedAtUtc" timestamp with time zone)
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


--
-- Name: sp_event_fine_policy_create_from_template(bigint, bigint, character varying, character varying, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.sp_event_fine_policy_create_from_template(p_event_id bigint, p_fine_policy_template_version_id bigint, p_policy_code character varying, p_policy_name character varying, p_actor_user_id integer) RETURNS bigint
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


--
-- Name: sp_event_qr_credential_issue(bigint, bytea, timestamp with time zone, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.sp_event_qr_credential_issue(p_event_registration_id bigint, p_token_hash bytea, p_expires_at_utc timestamp with time zone, p_actor_user_id integer) RETURNS TABLE("eventParticipantQrCredentialId" bigint, "issuedAtUtc" timestamp with time zone, "expiresAtUtc" timestamp with time zone)
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


--
-- Name: sp_event_roster_generate_from_audience_rules(bigint, integer, integer, integer); Type: PROCEDURE; Schema: ssc; Owner: -
--

CREATE PROCEDURE ssc.sp_event_roster_generate_from_audience_rules(IN p_event_id bigint, IN p_actor_user_id integer, INOUT p_new_registrations_count integer DEFAULT 0, INOUT p_new_participants_count integer DEFAULT 0)
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


--
-- Name: sp_event_session_qr_revoke(bigint, character varying, integer); Type: PROCEDURE; Schema: ssc; Owner: -
--

CREATE PROCEDURE ssc.sp_event_session_qr_revoke(IN p_event_session_qr_token_id bigint, IN p_reason character varying, IN p_actor_user_id integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
        IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN RAISE EXCEPTION 'Revocation reason is required.' USING ERRCODE = '22023'; END IF;
        IF NOT EXISTS (SELECT 1 FROM "Users" u WHERE u."userId" = p_actor_user_id AND u."isActive" = TRUE AND u."canManageAttendance" = TRUE) THEN RAISE EXCEPTION 'Active attendance manager authorization required.' USING ERRCODE = '42501'; END IF;
        UPDATE "EventSessionQrTokens" SET "revokedAtUtc" = clock_timestamp(), "revokedByUserId" = p_actor_user_id, "revocationReason" = trim(p_reason) WHERE "eventSessionQrTokenId" = p_event_session_qr_token_id AND "revokedAtUtc" IS NULL;
        IF NOT FOUND THEN RAISE EXCEPTION 'Active event-session QR token not found.' USING ERRCODE = 'P0002'; END IF;
    END $$;


--
-- Name: sp_fine_payment_post(character varying, character varying, numeric, integer, character varying, jsonb); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.sp_fine_payment_post(p_payment_reference character varying, p_payment_method_code character varying, p_total_amount numeric, p_received_by_user_id integer, p_external_payment_reference character varying, p_allocations jsonb) RETURNS bigint
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


--
-- Name: sp_fine_payment_void(bigint, character varying, integer); Type: PROCEDURE; Schema: ssc; Owner: -
--

CREATE PROCEDURE ssc.sp_fine_payment_void(IN p_fine_payment_id bigint, IN p_void_reason character varying, IN p_voided_by_user_id integer)
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


--
-- Name: sp_fine_waiver_request(bigint, character varying, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.sp_fine_waiver_request(p_student_fine_assessment_id bigint, p_waiver_reason character varying, p_requested_by_user_id integer) RETURNS bigint
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


--
-- Name: sp_fine_waiver_review(bigint, character varying, character varying, integer); Type: PROCEDURE; Schema: ssc; Owner: -
--

CREATE PROCEDURE ssc.sp_fine_waiver_review(IN p_fine_waiver_request_id bigint, IN p_decision character varying, IN p_review_notes character varying, IN p_reviewer_user_id integer)
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


--
-- Name: sp_student_fine_assess_closed_session(bigint, integer, integer, numeric); Type: PROCEDURE; Schema: ssc; Owner: -
--

CREATE PROCEDURE ssc.sp_student_fine_assess_closed_session(IN p_event_session_id bigint, IN p_actor_user_id integer, INOUT p_assessments_created integer DEFAULT 0, INOUT p_total_amount_assessed numeric DEFAULT 0.00)
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


--
-- Name: usp_attendance_cancelscan(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_attendance_cancelscan(p_id bigint) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE ssc."AttendanceLogs" SET "isCancelled" = true WHERE "attendanceLogId" = p_id;
$$;


--
-- Name: usp_attendance_delete(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_attendance_delete(p_id bigint) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM ssc."AttendanceLogs" WHERE "attendanceLogId" = p_id;
$$;


--
-- Name: usp_attendance_getbyid(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_attendance_getbyid(p_id bigint) RETURNS TABLE("Id" bigint, "EventId" bigint, "EventName" character varying, "StudentId" bigint, "StudentIdCode" character varying, "StudentName" text, "StudentSection" character varying, "SessionWindowId" bigint, "SessionLabel" character varying, "Direction" character varying, "ScannedAt" timestamp with time zone, "ScannedBy" integer, "ScannedByName" character varying, "Status" text, "DeviceNote" character varying)
    LANGUAGE sql
    AS $$
    SELECT 
        al."attendanceLogId" AS "Id",
        es."eventId" AS "EventId",
        e."eventName" AS "EventName",
        ep."studentId" AS "StudentId",
        s."studentNumber" AS "StudentIdCode",
        (s."firstName" || ' ' || s."lastName") AS "StudentName",
        s.suffix AS "StudentSection",
        es."eventSessionId" AS "SessionWindowId",
        es."sessionName" AS "SessionLabel",
        al."actionCode" AS "Direction",
        al."recordedAtUtc" AS "ScannedAt",
        al."actorUserId" AS "ScannedBy",
        u."displayName" AS "ScannedByName",
        CASE WHEN al."isCancelled" THEN 'cancelled' ELSE 'confirmed' END AS "Status",
        al."deviceNote" AS "DeviceNote"
    FROM ssc."AttendanceLogs" al
    JOIN ssc."AttendanceRecords" ar ON al."attendanceRecordId" = ar."attendanceRecordId"
    JOIN ssc."EventParticipants" ep ON ar."eventParticipantId" = ep."eventParticipantId"
    JOIN ssc."EventSessions" es ON ep."eventSessionId" = es."eventSessionId"
    JOIN ssc."Events" e ON es."eventId" = e."eventId"
    JOIN ssc."Students" s ON ep."studentId" = s."studentId"
    JOIN ssc."Users" u ON al."actorUserId" = u."userId"
    WHERE al."attendanceLogId" = p_id;
$$;


--
-- Name: usp_attendance_list(bigint, bigint, bigint, integer, character varying, date, character varying, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_attendance_list(p_eventid bigint, p_studentid bigint, p_sessionwindowid bigint, p_scannedby integer, p_status character varying, p_date date, p_search character varying, p_limit integer) RETURNS TABLE("Id" bigint, "EventId" bigint, "EventName" character varying, "StudentId" bigint, "StudentIdCode" character varying, "StudentName" text, "StudentSection" character varying, "SessionWindowId" bigint, "SessionLabel" character varying, "Direction" character varying, "ScannedAt" timestamp with time zone, "ScannedBy" integer, "ScannedByName" character varying, "Status" text, "DeviceNote" character varying)
    LANGUAGE sql
    AS $$
    SELECT 
        al."attendanceLogId" AS "Id",
        es."eventId" AS "EventId",
        e."eventName" AS "EventName",
        ep."studentId" AS "StudentId",
        s."studentNumber" AS "StudentIdCode",
        (s."firstName" || ' ' || s."lastName") AS "StudentName",
        s.suffix AS "StudentSection",
        es."eventSessionId" AS "SessionWindowId",
        es."sessionName" AS "SessionLabel",
        al."actionCode" AS "Direction",
        al."recordedAtUtc" AS "ScannedAt",
        al."actorUserId" AS "ScannedBy",
        u."displayName" AS "ScannedByName",
        CASE WHEN al."isCancelled" THEN 'cancelled' ELSE 'confirmed' END AS "Status",
        al."deviceNote" AS "DeviceNote"
    FROM ssc."AttendanceLogs" al
    JOIN ssc."AttendanceRecords" ar ON al."attendanceRecordId" = ar."attendanceRecordId"
    JOIN ssc."EventParticipants" ep ON ar."eventParticipantId" = ep."eventParticipantId"
    JOIN ssc."EventSessions" es ON ep."eventSessionId" = es."eventSessionId"
    JOIN ssc."Events" e ON es."eventId" = e."eventId"
    JOIN ssc."Students" s ON ep."studentId" = s."studentId"
    JOIN ssc."Users" u ON al."actorUserId" = u."userId"
    WHERE (p_eventId IS NULL OR es."eventId" = p_eventId)
      AND (p_studentId IS NULL OR ep."studentId" = p_studentId)
      AND (p_sessionWindowId IS NULL OR es."eventSessionId" = p_sessionWindowId)
      AND (p_scannedBy IS NULL OR al."actorUserId" = p_scannedBy)
      AND (p_status IS NULL OR (p_status = 'cancelled' AND al."isCancelled" = true) OR (p_status = 'confirmed' AND al."isCancelled" = false))
      AND (p_date IS NULL OR DATE(al."recordedAtUtc") = p_date)
      AND (p_search IS NULL OR p_search = '' OR LOWER(s."studentNumber") LIKE LOWER('%' || p_search || '%') OR LOWER(s."firstName" || ' ' || s."lastName") LIKE LOWER('%' || p_search || '%'))
    ORDER BY al."recordedAtUtc" DESC
    LIMIT p_limit;
$$;


--
-- Name: usp_attendance_recordscan(bigint, bigint, bigint, character varying, integer, character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_attendance_recordscan(p_eventid bigint, p_studentid bigint, p_sessionwindowid bigint, p_direction character varying, p_scannedby integer, p_devicenote character varying) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_participantId bigint;
    v_recordId bigint;
    v_logId bigint;
    v_action varchar;
    v_termId bigint;
    v_enrollmentId bigint;
BEGIN
    SELECT "academicTermId" INTO v_termId FROM ssc."EventSessions" WHERE "eventSessionId" = p_sessionWindowId;
    IF v_termId IS NULL THEN v_termId := 1; END IF;

    IF UPPER(p_direction) IN ('IN', 'CHECK_IN') THEN
        v_action := 'CHECK_IN';
    ELSIF UPPER(p_direction) IN ('OUT', 'CHECK_OUT') THEN
        v_action := 'CHECK_OUT';
    ELSE
        v_action := 'CHECK_IN';
    END IF;

    -- 1. Get or create participant
    SELECT "eventParticipantId" INTO v_participantId
    FROM ssc."EventParticipants"
    WHERE "eventSessionId" = p_sessionWindowId AND "studentId" = p_studentId;

    IF v_participantId IS NULL THEN
        SELECT "studentEnrollmentId" INTO v_enrollmentId
        FROM ssc."StudentEnrollments"
        WHERE "studentId" = p_studentId AND "academicTermId" = v_termId LIMIT 1;

        IF v_enrollmentId IS NULL THEN
            INSERT INTO ssc."StudentEnrollments" ("studentId", "academicTermId", "academicProgramId", "yearLevel", "enrollmentStatusCode", "effectiveFromUtc")
            VALUES (p_studentId, v_termId, 1, 1, 'ENROLLED', CURRENT_TIMESTAMP)
            RETURNING "studentEnrollmentId" INTO v_enrollmentId;
        END IF;

        INSERT INTO ssc."EventParticipants" ("eventSessionId", "academicTermId", "studentEnrollmentId", "studentId", "isRequired", "addedByUserId")
        VALUES (p_sessionWindowId, v_termId, v_enrollmentId, p_studentId, true, p_scannedBy)
        RETURNING "eventParticipantId" INTO v_participantId;
    END IF;

    -- 2. Get or create record
    SELECT "attendanceRecordId" INTO v_recordId
    FROM ssc."AttendanceRecords"
    WHERE "eventParticipantId" = v_participantId;

    IF v_recordId IS NULL THEN
        INSERT INTO ssc."AttendanceRecords" ("eventParticipantId", "lastChangedByUserId", "checkedInAtUtc")
        VALUES (v_participantId, p_scannedBy, CURRENT_TIMESTAMP)
        RETURNING "attendanceRecordId" INTO v_recordId;
    END IF;

    -- 3. Log scan
    INSERT INTO ssc."AttendanceLogs" ("attendanceRecordId", "actionCode", "actorUserId", "deviceNote", "recordedAtUtc")
    VALUES (v_recordId, v_action, p_scannedBy, p_deviceNote, CURRENT_TIMESTAMP)
    RETURNING "attendanceLogId" INTO v_logId;

    RETURN v_logId;
END;
$$;


--
-- Name: usp_attendance_update(bigint, character varying, character varying, character varying, timestamp with time zone); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_attendance_update(p_id bigint, p_direction character varying, p_status character varying, p_devicenote character varying, p_recordedatutc timestamp with time zone) RETURNS void
    LANGUAGE sql
    AS $$
    UPDATE ssc."AttendanceLogs"
    SET "actionCode" = COALESCE(p_direction, "actionCode"),
        "isCancelled" = CASE WHEN p_status = 'cancelled' THEN true WHEN p_status = 'confirmed' THEN false ELSE "isCancelled" END,
        "deviceNote" = COALESCE(p_deviceNote, "deviceNote"),
        "recordedAtUtc" = COALESCE(p_recordedAtUtc, "recordedAtUtc")
    WHERE "attendanceLogId" = p_id;
$$;


--
-- Name: usp_event_countattendanceforwindow(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_countattendanceforwindow(p_windowid bigint) RETURNS integer
    LANGUAGE sql
    AS $$
    SELECT COUNT(*)::integer
    FROM ssc."EventParticipants" ep
    JOIN ssc."AttendanceRecords" ar ON ep."eventParticipantId" = ar."eventParticipantId"
    WHERE ep."eventSessionId" = p_windowId;
$$;


--
-- Name: usp_event_delete(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_delete(p_id bigint) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM ssc."Events" WHERE "eventId" = p_id;
$$;


--
-- Name: usp_event_deletewindow(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_deletewindow(p_id bigint) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM ssc."EventSessions" WHERE "eventSessionId" = p_id;
$$;


--
-- Name: usp_event_getbyid(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_getbyid(p_id bigint) RETURNS TABLE("Id" bigint, "EventCode" character varying, "Name" character varying, "Description" character varying, "Venue" character varying, "EventDate" date, "Status" character varying, "CreatedBy" integer, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "eventId" AS "Id", "eventCode" AS "EventCode", "eventName" AS "Name", description AS "Description", venue AS "Venue", "eventDate" AS "EventDate", "eventStatusCode" AS "Status", "createdByUserId" AS "CreatedBy", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Events"
    WHERE "eventId" = p_id;
$$;


--
-- Name: usp_event_getwindowbyid(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_getwindowbyid(p_id bigint) RETURNS TABLE("Id" bigint, "EventId" bigint, "SessionLabel" character varying, "StartTime" text, "EndTime" text, "SortOrder" integer, "CreatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "eventSessionId" AS "Id", "eventId" AS "EventId", "sessionName" AS "SessionLabel", to_char("startsAtUtc", 'HH24:MI') AS "StartTime", to_char("endsAtUtc", 'HH24:MI') AS "EndTime", "sortOrder" AS "SortOrder", "createdAtUtc" AS "CreatedAtUtc"
    FROM ssc."EventSessions"
    WHERE "eventSessionId" = p_id;
$$;


--
-- Name: usp_event_getwindowsforevent(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_getwindowsforevent(p_eventid bigint) RETURNS TABLE("Id" bigint, "EventId" bigint, "SessionLabel" character varying, "StartTime" text, "EndTime" text, "SortOrder" integer, "CreatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "eventSessionId" AS "Id", "eventId" AS "EventId", "sessionName" AS "SessionLabel", to_char("startsAtUtc", 'HH24:MI') AS "StartTime", to_char("endsAtUtc", 'HH24:MI') AS "EndTime", "sortOrder" AS "SortOrder", "createdAtUtc" AS "CreatedAtUtc"
    FROM ssc."EventSessions"
    WHERE "eventId" = p_eventId
    ORDER BY "sortOrder" ASC;
$$;


--
-- Name: usp_event_insert(bigint, character varying, character varying, character varying, character varying, date, character varying, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_insert(p_academictermid bigint, p_eventcode character varying, p_eventname character varying, p_description character varying, p_venue character varying, p_eventdate date, p_statuscode character varying, p_createdbyuserid integer) RETURNS TABLE("Id" bigint, "EventCode" character varying, "Name" character varying, "Description" character varying, "Venue" character varying, "EventDate" date, "Status" character varying, "CreatedBy" integer, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    INSERT INTO ssc."Events" ("academicTermId", "eventCode", "eventName", description, venue, "eventDate", "eventStatusCode", "createdByUserId")
    VALUES (p_academicTermId, p_eventCode, p_eventName, p_description, p_venue, p_eventDate, p_statusCode, p_createdByUserId)
    RETURNING "eventId" AS "Id", "eventCode" AS "EventCode", "eventName" AS "Name", description AS "Description", venue AS "Venue", "eventDate" AS "EventDate", "eventStatusCode" AS "Status", "createdByUserId" AS "CreatedBy", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc";
$$;


--
-- Name: usp_event_insertwindow(bigint, character varying, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_insertwindow(p_eventid bigint, p_sessionlabel character varying, p_sortorder integer) RETURNS TABLE("Id" bigint, "EventId" bigint, "SessionLabel" character varying, "StartTime" text, "EndTime" text, "SortOrder" integer, "CreatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    INSERT INTO ssc."EventSessions" ("eventId", "academicTermId", "sessionCode", "sessionName", "startsAtUtc", "endsAtUtc", "checkInOpensAtUtc", "checkInClosesAtUtc", "lateAfterUtc", "checkOutOpensAtUtc", "checkOutClosesAtUtc", "sortOrder")
    VALUES (p_eventId, 1, p_sessionLabel, p_sessionLabel, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '2 hours', CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '2 hours', p_sortOrder)
    RETURNING "eventSessionId" AS "Id", "eventId" AS "EventId", "sessionName" AS "SessionLabel", to_char("startsAtUtc", 'HH24:MI') AS "StartTime", to_char("endsAtUtc", 'HH24:MI') AS "EndTime", "sortOrder" AS "SortOrder", "createdAtUtc" AS "CreatedAtUtc";
$$;


--
-- Name: usp_event_list(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_list() RETURNS TABLE("Id" bigint, "EventCode" character varying, "Name" character varying, "Description" character varying, "Venue" character varying, "EventDate" date, "Status" character varying, "CreatedBy" integer, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "eventId" AS "Id", "eventCode" AS "EventCode", "eventName" AS "Name", description AS "Description", venue AS "Venue", "eventDate" AS "EventDate", "eventStatusCode" AS "Status", "createdByUserId" AS "CreatedBy", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Events"
    ORDER BY "eventDate" DESC;
$$;


--
-- Name: usp_event_listwindows(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_listwindows() RETURNS TABLE("Id" bigint, "EventId" bigint, "SessionLabel" character varying, "StartTime" text, "EndTime" text, "SortOrder" integer, "CreatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "eventSessionId" AS "Id", "eventId" AS "EventId", "sessionName" AS "SessionLabel", to_char("startsAtUtc", 'HH24:MI') AS "StartTime", to_char("endsAtUtc", 'HH24:MI') AS "EndTime", "sortOrder" AS "SortOrder", "createdAtUtc" AS "CreatedAtUtc"
    FROM ssc."EventSessions"
    ORDER BY "sortOrder" ASC;
$$;


--
-- Name: usp_event_update(bigint, character varying, date, character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_update(p_id bigint, p_name character varying, p_eventdate date, p_statuscode character varying) RETURNS TABLE("Id" bigint, "EventCode" character varying, "Name" character varying, "Description" character varying, "Venue" character varying, "EventDate" date, "Status" character varying, "CreatedBy" integer, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    UPDATE ssc."Events"
    SET "eventName" = COALESCE(p_name, "eventName"),
        "eventDate" = COALESCE(p_eventDate, "eventDate"),
        "eventStatusCode" = COALESCE(p_statusCode, "eventStatusCode"),
        "updatedAtUtc" = CURRENT_TIMESTAMP
    WHERE "eventId" = p_id
    RETURNING "eventId" AS "Id", "eventCode" AS "EventCode", "eventName" AS "Name", description AS "Description", venue AS "Venue", "eventDate" AS "EventDate", "eventStatusCode" AS "Status", "createdByUserId" AS "CreatedBy", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc";
$$;


--
-- Name: usp_event_updatewindow(bigint, character varying, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_event_updatewindow(p_id bigint, p_sessionlabel character varying, p_sortorder integer) RETURNS TABLE("Id" bigint, "EventId" bigint, "SessionLabel" character varying, "StartTime" text, "EndTime" text, "SortOrder" integer, "CreatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    UPDATE ssc."EventSessions"
    SET "sessionName" = COALESCE(p_sessionLabel, "sessionName"),
        "sortOrder" = COALESCE(p_sortOrder, "sortOrder")
    WHERE "eventSessionId" = p_id
    RETURNING "eventSessionId" AS "Id", "eventId" AS "EventId", "sessionName" AS "SessionLabel", to_char("startsAtUtc", 'HH24:MI') AS "StartTime", to_char("endsAtUtc", 'HH24:MI') AS "EndTime", "sortOrder" AS "SortOrder", "createdAtUtc" AS "CreatedAtUtc";
$$;


--
-- Name: usp_student_count(character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_count(p_search character varying) RETURNS integer
    LANGUAGE sql
    AS $$
    SELECT COUNT(*)::integer
    FROM ssc."Students"
    WHERE (p_search IS NULL OR p_search = '' OR LOWER("studentNumber") LIKE LOWER('%' || p_search || '%') OR LOWER("firstName" || ' ' || "lastName") LIKE LOWER('%' || p_search || '%'));
$$;


--
-- Name: usp_student_delete(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_delete(p_id bigint) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM ssc."Students" WHERE "studentId" = p_id;
$$;


--
-- Name: usp_student_getbycode(character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_getbycode(p_studentnumber character varying) RETURNS TABLE("Id" bigint, "StudentIdCode" character varying, "UserId" integer, "FullName" text, "Section" character varying, "PhotoUrl" text, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "studentId" AS "Id", "studentNumber" AS "StudentIdCode", "userId" AS "UserId", ("firstName" || ' ' || "lastName") AS "FullName", suffix AS "Section", "photoUrl" AS "PhotoUrl", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Students"
    WHERE LOWER("studentNumber") = LOWER(p_studentNumber);
$$;


--
-- Name: usp_student_getbyid(bigint); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_getbyid(p_id bigint) RETURNS TABLE("Id" bigint, "StudentIdCode" character varying, "UserId" integer, "FullName" text, "Section" character varying, "PhotoUrl" text, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "studentId" AS "Id", "studentNumber" AS "StudentIdCode", "userId" AS "UserId", ("firstName" || ' ' || "lastName") AS "FullName", suffix AS "Section", "photoUrl" AS "PhotoUrl", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Students"
    WHERE "studentId" = p_id;
$$;


--
-- Name: usp_student_insert(character varying, character varying, character varying, character varying, text, boolean); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_insert(p_studentnumber character varying, p_firstname character varying, p_lastname character varying, p_suffix character varying, p_photourl text, p_isactive boolean) RETURNS TABLE("Id" bigint, "StudentIdCode" character varying, "UserId" integer, "FullName" text, "Section" character varying, "PhotoUrl" text, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    INSERT INTO ssc."Students" ("studentNumber", "firstName", "lastName", suffix, "photoUrl", "isActive")
    VALUES (p_studentNumber, p_firstName, p_lastName, p_suffix, p_photoUrl, p_isActive)
    RETURNING "studentId" AS "Id", "studentNumber" AS "StudentIdCode", "userId" AS "UserId", ("firstName" || ' ' || "lastName") AS "FullName", suffix AS "Section", "photoUrl" AS "PhotoUrl", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc";
$$;


--
-- Name: usp_student_list(character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_list(p_search character varying) RETURNS TABLE("Id" bigint, "StudentIdCode" character varying, "UserId" integer, "FullName" text, "Section" character varying, "PhotoUrl" text, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "studentId" AS "Id", "studentNumber" AS "StudentIdCode", "userId" AS "UserId", ("firstName" || ' ' || "lastName") AS "FullName", suffix AS "Section", "photoUrl" AS "PhotoUrl", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Students"
    WHERE (p_search IS NULL OR p_search = '' OR LOWER("studentNumber") LIKE LOWER('%' || p_search || '%') OR LOWER("firstName" || ' ' || "lastName") LIKE LOWER('%' || p_search || '%'))
    ORDER BY "lastName" ASC, "firstName" ASC;
$$;


--
-- Name: usp_student_listpage(character varying, integer, integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_listpage(p_search character varying, p_limit integer, p_offset integer) RETURNS TABLE("Id" bigint, "StudentIdCode" character varying, "UserId" integer, "FullName" text, "Section" character varying, "PhotoUrl" text, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "studentId" AS "Id", "studentNumber" AS "StudentIdCode", "userId" AS "UserId", ("firstName" || ' ' || "lastName") AS "FullName", suffix AS "Section", "photoUrl" AS "PhotoUrl", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Students"
    WHERE (p_search IS NULL OR p_search = '' OR LOWER("studentNumber") LIKE LOWER('%' || p_search || '%') OR LOWER("firstName" || ' ' || "lastName") LIKE LOWER('%' || p_search || '%'))
    ORDER BY "lastName" ASC, "firstName" ASC
    LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: usp_student_update(bigint, character varying, character varying, character varying, character varying, text); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_student_update(p_id bigint, p_studentnumber character varying, p_firstname character varying, p_lastname character varying, p_suffix character varying, p_photourl text) RETURNS TABLE("Id" bigint, "StudentIdCode" character varying, "UserId" integer, "FullName" text, "Section" character varying, "PhotoUrl" text, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    UPDATE ssc."Students"
    SET "studentNumber" = COALESCE(p_studentNumber, "studentNumber"),
        "firstName" = COALESCE(p_firstName, "firstName"),
        "lastName" = COALESCE(p_lastName, "lastName"),
        suffix = COALESCE(p_suffix, suffix),
        "photoUrl" = COALESCE(p_photoUrl, "photoUrl"),
        "updatedAtUtc" = CURRENT_TIMESTAMP
    WHERE "studentId" = p_id
    RETURNING "studentId" AS "Id", "studentNumber" AS "StudentIdCode", "userId" AS "UserId", ("firstName" || ' ' || "lastName") AS "FullName", suffix AS "Section", "photoUrl" AS "PhotoUrl", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc";
$$;


--
-- Name: usp_system_checkhealth(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_system_checkhealth() RETURNS TABLE("Version" text, "ServerTime" timestamp with time zone, "IsConnected" boolean)
    LANGUAGE sql
    AS $$
    SELECT version() AS "Version", CURRENT_TIMESTAMP AS "ServerTime", true AS "IsConnected";
$$;


--
-- Name: usp_user_countscansbymoderator(integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_countscansbymoderator(p_moderatorid integer) RETURNS integer
    LANGUAGE sql
    AS $$
    SELECT COUNT(*)::integer FROM ssc."AttendanceLogs" WHERE "actorUserId" = p_moderatorId;
$$;


--
-- Name: usp_user_delete(integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_delete(p_id integer) RETURNS void
    LANGUAGE sql
    AS $$
    DELETE FROM ssc."Users" WHERE "userId" = p_id;
$$;


--
-- Name: usp_user_getbyid(integer); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_getbyid(p_id integer) RETURNS TABLE("Id" integer, "Username" character varying, "PasswordHash" text, "Name" character varying, "Role" character varying, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "userId" AS "Id", username AS "Username", "passwordHash" AS "PasswordHash", "displayName" AS "Name", role AS "Role", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Users"
    WHERE "userId" = p_id;
$$;


--
-- Name: usp_user_getbyusername(character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_getbyusername(p_username character varying) RETURNS TABLE("Id" integer, "Username" character varying, "PasswordHash" text, "Name" character varying, "Role" character varying, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "userId" AS "Id", username AS "Username", "passwordHash" AS "PasswordHash", "displayName" AS "Name", role AS "Role", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Users"
    WHERE LOWER(username) = LOWER(p_username);
$$;


--
-- Name: usp_user_insert(character varying, text, character varying, character varying, boolean); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_insert(p_username character varying, p_passwordhash text, p_name character varying, p_role character varying, p_isactive boolean) RETURNS TABLE("Id" integer, "Username" character varying, "PasswordHash" text, "Name" character varying, "Role" character varying, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    INSERT INTO ssc."Users" (username, "passwordHash", "displayName", role, "isActive")
    VALUES (p_username, p_passwordHash, p_name, p_role, p_isActive)
    RETURNING "userId" AS "Id", username AS "Username", "passwordHash" AS "PasswordHash", "displayName" AS "Name", role AS "Role", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc";
$$;


--
-- Name: usp_user_listmoderators(); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_listmoderators() RETURNS TABLE("Id" integer, "Username" character varying, "PasswordHash" text, "Name" character varying, "Role" character varying, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    SELECT "userId" AS "Id", username AS "Username", "passwordHash" AS "PasswordHash", "displayName" AS "Name", role AS "Role", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc"
    FROM ssc."Users"
    WHERE role = 'moderator' AND "isActive" = true
    ORDER BY "displayName" ASC;
$$;


--
-- Name: usp_user_update(integer, character varying, text, character varying); Type: FUNCTION; Schema: ssc; Owner: -
--

CREATE FUNCTION ssc.usp_user_update(p_id integer, p_username character varying, p_passwordhash text, p_name character varying) RETURNS TABLE("Id" integer, "Username" character varying, "PasswordHash" text, "Name" character varying, "Role" character varying, "IsActive" boolean, "CreatedAtUtc" timestamp with time zone, "UpdatedAtUtc" timestamp with time zone)
    LANGUAGE sql
    AS $$
    UPDATE ssc."Users"
    SET "displayName" = COALESCE(p_name, "displayName"),
        username = COALESCE(p_username, username),
        "passwordHash" = COALESCE(p_passwordHash, "passwordHash"),
        "updatedAtUtc" = CURRENT_TIMESTAMP
    WHERE "userId" = p_id
    RETURNING "userId" AS "Id", username AS "Username", "passwordHash" AS "PasswordHash", "displayName" AS "Name", role AS "Role", "isActive" AS "IsActive", "createdAtUtc" AS "CreatedAtUtc", "updatedAtUtc" AS "UpdatedAtUtc";
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AcademicPrograms; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AcademicPrograms" (
    "academicProgramId" bigint NOT NULL,
    "programCode" character varying(30) NOT NULL,
    "programName" character varying(200) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL
);


--
-- Name: AcademicPrograms_academicProgramId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AcademicPrograms" ALTER COLUMN "academicProgramId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AcademicPrograms_academicProgramId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AcademicTerms; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AcademicTerms" (
    "academicTermId" bigint NOT NULL,
    "academicYearId" bigint NOT NULL,
    "termCode" character varying(30) NOT NULL,
    "termName" character varying(100) NOT NULL,
    "startsOn" date NOT NULL,
    "endsOn" date NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_academic_terms_dates CHECK (("startsOn" <= "endsOn"))
);


--
-- Name: AcademicTerms_academicTermId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AcademicTerms" ALTER COLUMN "academicTermId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AcademicTerms_academicTermId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AcademicYears; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AcademicYears" (
    "academicYearId" bigint NOT NULL,
    "yearCode" character varying(30) NOT NULL,
    "yearName" character varying(100) NOT NULL,
    "startsOn" date NOT NULL,
    "endsOn" date NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_academic_years_dates CHECK (("startsOn" <= "endsOn"))
);


--
-- Name: AcademicYears_academicYearId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AcademicYears" ALTER COLUMN "academicYearId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AcademicYears_academicYearId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AttendanceCorrections; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AttendanceCorrections" (
    "attendanceCorrectionId" bigint NOT NULL,
    "attendanceRecordId" bigint NOT NULL,
    "expectedRowVersion" bytea NOT NULL,
    "proposedCheckInAtUtc" timestamp(3) with time zone,
    "proposedCheckOutAtUtc" timestamp(3) with time zone,
    "proposedIsExcused" boolean NOT NULL,
    "proposedExcuseReason" character varying(500),
    reason character varying(1000) NOT NULL,
    "requestedByUserId" integer NOT NULL,
    "requestedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "correctionStatusCode" character varying(10) DEFAULT 'PENDING'::character varying NOT NULL,
    "reviewedByUserId" integer,
    "reviewedAtUtc" timestamp(3) with time zone,
    "reviewNote" character varying(1000),
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_attendance_corrections_excuse CHECK (((("proposedIsExcused" = false) AND ("proposedExcuseReason" IS NULL)) OR (("proposedIsExcused" = true) AND ("proposedExcuseReason" IS NOT NULL) AND (char_length(btrim(("proposedExcuseReason")::text)) > 0)))),
    CONSTRAINT ck_attendance_corrections_order CHECK ((("proposedCheckOutAtUtc" IS NULL) OR (("proposedCheckInAtUtc" IS NOT NULL) AND ("proposedCheckOutAtUtc" >= "proposedCheckInAtUtc")))),
    CONSTRAINT ck_attendance_corrections_reason CHECK ((char_length(btrim((reason)::text)) > 0)),
    CONSTRAINT ck_attendance_corrections_review CHECK ((((("correctionStatusCode")::text = 'PENDING'::text) AND ("reviewedByUserId" IS NULL) AND ("reviewedAtUtc" IS NULL)) OR ((("correctionStatusCode")::text = ANY ((ARRAY['APPLIED'::character varying, 'REJECTED'::character varying])::text[])) AND ("reviewedByUserId" IS NOT NULL) AND ("reviewedAtUtc" IS NOT NULL) AND ("reviewedAtUtc" >= "requestedAtUtc") AND ("reviewedByUserId" <> "requestedByUserId")))),
    CONSTRAINT ck_attendance_corrections_status CHECK ((("correctionStatusCode")::text = ANY ((ARRAY['PENDING'::character varying, 'APPLIED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: AttendanceCorrections_attendanceCorrectionId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AttendanceCorrections" ALTER COLUMN "attendanceCorrectionId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AttendanceCorrections_attendanceCorrectionId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AttendanceDevices; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AttendanceDevices" (
    "attendanceDeviceId" bigint NOT NULL,
    "deviceCode" character varying(50) NOT NULL,
    "deviceName" character varying(150) NOT NULL,
    "deviceFingerprintHash" bytea NOT NULL,
    "assignedToUserId" integer,
    "deviceStatusCode" character varying(12) DEFAULT 'ACTIVE'::character varying NOT NULL,
    "registeredByUserId" integer NOT NULL,
    "registeredAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "lastSeenAtUtc" timestamp with time zone,
    "revokedAtUtc" timestamp with time zone,
    CONSTRAINT ck_attendance_devices_revoke CHECK ((((("deviceStatusCode")::text <> 'REVOKED'::text) AND ("revokedAtUtc" IS NULL)) OR ((("deviceStatusCode")::text = 'REVOKED'::text) AND ("revokedAtUtc" IS NOT NULL)))),
    CONSTRAINT ck_attendance_devices_status CHECK ((("deviceStatusCode")::text = ANY ((ARRAY['ACTIVE'::character varying, 'SUSPENDED'::character varying, 'REVOKED'::character varying])::text[])))
);


--
-- Name: AttendanceDevices_attendanceDeviceId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AttendanceDevices" ALTER COLUMN "attendanceDeviceId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."AttendanceDevices_attendanceDeviceId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AttendanceLogs; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AttendanceLogs" (
    "attendanceLogId" bigint NOT NULL,
    "attendanceRecordId" bigint NOT NULL,
    "attendanceCorrectionId" bigint,
    "actionCode" character varying(15) NOT NULL,
    "oldCheckInAtUtc" timestamp(3) with time zone,
    "oldCheckOutAtUtc" timestamp(3) with time zone,
    "newCheckInAtUtc" timestamp(3) with time zone,
    "newCheckOutAtUtc" timestamp(3) with time zone,
    "oldIsExcused" boolean,
    "newIsExcused" boolean DEFAULT false NOT NULL,
    "oldExcuseReason" character varying(500),
    "newExcuseReason" character varying(500),
    "actorUserId" integer NOT NULL,
    "recordedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "deviceNote" character varying(200),
    "isCancelled" boolean DEFAULT false NOT NULL,
    CONSTRAINT ck_attendance_logs_action CHECK ((("actionCode")::text = ANY ((ARRAY['CHECK_IN'::character varying, 'CHECK_OUT'::character varying, 'CORRECTION'::character varying])::text[]))),
    CONSTRAINT ck_attendance_logs_correction CHECK ((((("actionCode")::text = 'CORRECTION'::text) AND ("attendanceCorrectionId" IS NOT NULL)) OR ((("actionCode")::text = ANY ((ARRAY['CHECK_IN'::character varying, 'CHECK_OUT'::character varying])::text[])) AND ("attendanceCorrectionId" IS NULL))))
);


--
-- Name: AttendanceLogs_attendanceLogId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AttendanceLogs" ALTER COLUMN "attendanceLogId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AttendanceLogs_attendanceLogId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AttendanceRecords; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AttendanceRecords" (
    "attendanceRecordId" bigint NOT NULL,
    "eventParticipantId" bigint NOT NULL,
    "checkedInAtUtc" timestamp(3) with time zone,
    "checkedOutAtUtc" timestamp(3) with time zone,
    "isExcused" boolean DEFAULT false NOT NULL,
    "excuseReason" character varying(500),
    "lastChangedByUserId" integer NOT NULL,
    "lastChangedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_attendance_records_excuse CHECK (((("isExcused" = false) AND ("excuseReason" IS NULL)) OR (("isExcused" = true) AND ("excuseReason" IS NOT NULL) AND (char_length(btrim(("excuseReason")::text)) > 0)))),
    CONSTRAINT ck_attendance_records_order CHECK ((("checkedOutAtUtc" IS NULL) OR (("checkedInAtUtc" IS NOT NULL) AND ("checkedOutAtUtc" >= "checkedInAtUtc"))))
);


--
-- Name: AttendanceRecords_attendanceRecordId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AttendanceRecords" ALTER COLUMN "attendanceRecordId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AttendanceRecords_attendanceRecordId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: AttendanceScanAttempts; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AttendanceScanAttempts" (
    "attendanceScanAttemptId" bigint NOT NULL,
    "eventSessionId" bigint,
    "eventRegistrationId" bigint,
    "eventParticipantId" bigint,
    "attendanceDeviceId" bigint,
    "tokenHash" bytea,
    "actionCode" character varying(3),
    "scanResultCode" character varying(20) NOT NULL,
    "failureReasonCode" character varying(40),
    "processedByUserId" integer NOT NULL,
    "scannedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "eventSessionQrTokenId" bigint,
    "resolvedStudentId" bigint,
    "scanMethodCode" character varying(30) DEFAULT 'STAFF_SCANNED_STUDENT_QR'::character varying NOT NULL,
    "clientRequestId" uuid,
    "clientFingerprintHash" bytea,
    "ipAddress" inet,
    latitude numeric(9,6),
    longitude numeric(9,6),
    "locationAccuracyMeters" numeric(10,2),
    "attendanceStatusCode" character varying(30),
    "attendanceEffectiveAtUtc" timestamp with time zone,
    CONSTRAINT ck_attendance_scan_attempts_action CHECK ((("actionCode")::text = ANY ((ARRAY['IN'::character varying, 'OUT'::character varying])::text[]))),
    CONSTRAINT ck_attendance_scan_attempts_method CHECK ((("scanMethodCode")::text = ANY ((ARRAY['STUDENT_SCANNED_EVENT_QR'::character varying, 'STAFF_SCANNED_STUDENT_QR'::character varying, 'MANUAL_STUDENT_NUMBER'::character varying, 'ADMIN_CORRECTION'::character varying])::text[]))),
    CONSTRAINT ck_attendance_scan_attempts_result CHECK ((("scanResultCode")::text = ANY ((ARRAY['ACCEPTED'::character varying, 'NO_CHANGE'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: AttendanceScanAttempts_attendanceScanAttemptId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AttendanceScanAttempts" ALTER COLUMN "attendanceScanAttemptId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."AttendanceScanAttempts_attendanceScanAttemptId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventParticipants; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventParticipants" (
    "eventParticipantId" bigint NOT NULL,
    "eventSessionId" bigint NOT NULL,
    "academicTermId" bigint NOT NULL,
    "studentEnrollmentId" bigint NOT NULL,
    "studentId" bigint NOT NULL,
    "isRequired" boolean DEFAULT true NOT NULL,
    "addedByUserId" integer NOT NULL,
    "addedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "eventRegistrationId" bigint
);


--
-- Name: EventSessions; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventSessions" (
    "eventSessionId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    "academicTermId" bigint NOT NULL,
    "sessionCode" character varying(30) NOT NULL,
    "sessionName" character varying(100) NOT NULL,
    "startsAtUtc" timestamp(3) with time zone NOT NULL,
    "endsAtUtc" timestamp(3) with time zone NOT NULL,
    "checkInOpensAtUtc" timestamp(3) with time zone NOT NULL,
    "checkInClosesAtUtc" timestamp(3) with time zone NOT NULL,
    "lateAfterUtc" timestamp(3) with time zone NOT NULL,
    "checkOutOpensAtUtc" timestamp(3) with time zone,
    "checkOutClosesAtUtc" timestamp(3) with time zone,
    "requiresCheckOut" boolean DEFAULT true NOT NULL,
    "minimumMinutes" integer DEFAULT 0 NOT NULL,
    "isClosed" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    "sessionTypeCode" character varying(20) DEFAULT 'GENERAL'::character varying NOT NULL,
    CONSTRAINT ck_event_sessions_dates CHECK ((("startsAtUtc" < "endsAtUtc") AND ("checkInOpensAtUtc" <= "startsAtUtc") AND ("checkInClosesAtUtc" >= "startsAtUtc") AND ("checkInClosesAtUtc" <= "endsAtUtc") AND ("lateAfterUtc" >= "startsAtUtc") AND ("lateAfterUtc" <= "checkInClosesAtUtc") AND ("checkOutOpensAtUtc" >= "startsAtUtc") AND ("checkOutOpensAtUtc" <= "checkOutClosesAtUtc") AND ("checkOutClosesAtUtc" >= "endsAtUtc"))),
    CONSTRAINT ck_event_sessions_minutes CHECK ((("minimumMinutes" >= 0) AND (("requiresCheckOut" = true) OR ("minimumMinutes" = 0))))
);


--
-- Name: AttendanceSessionStatus; Type: VIEW; Schema: ssc; Owner: -
--

CREATE VIEW ssc."AttendanceSessionStatus" AS
 SELECT r."attendanceRecordId",
    ep."eventSessionId",
    ep."studentId",
    ep."studentEnrollmentId",
    r."checkedInAtUtc",
    r."checkedOutAtUtc",
    r."isExcused",
    r."excuseReason",
        CASE
            WHEN r."isExcused" THEN 'EXCUSED'::text
            WHEN ((r."checkedInAtUtc" IS NULL) AND es."isClosed") THEN 'ABSENT'::text
            WHEN (r."checkedInAtUtc" IS NULL) THEN 'PENDING'::text
            WHEN (r."checkedInAtUtc" > es."lateAfterUtc") THEN 'LATE'::text
            ELSE 'PRESENT'::text
        END AS "attendanceStatusCode",
        CASE
            WHEN ((r."checkedInAtUtc" IS NOT NULL) AND (r."checkedOutAtUtc" IS NOT NULL)) THEN (floor((EXTRACT(epoch FROM (r."checkedOutAtUtc" - r."checkedInAtUtc")) / (60)::numeric)))::integer
            ELSE NULL::integer
        END AS "minutesPresent"
   FROM ((ssc."EventParticipants" ep
     JOIN ssc."EventSessions" es ON ((es."eventSessionId" = ep."eventSessionId")))
     LEFT JOIN ssc."AttendanceRecords" r ON ((r."eventParticipantId" = ep."eventParticipantId")));


--
-- Name: AuthProviders; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."AuthProviders" (
    "authProviderId" integer NOT NULL,
    "providerCode" character varying(30) NOT NULL,
    "displayName" character varying(100) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_auth_providers_code CHECK ((char_length(btrim(("providerCode")::text)) > 0)),
    CONSTRAINT ck_auth_providers_name CHECK ((char_length(btrim(("displayName")::text)) > 0))
);


--
-- Name: AuthProviders_authProviderId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."AuthProviders" ALTER COLUMN "authProviderId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."AuthProviders_authProviderId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventAnnouncements; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventAnnouncements" (
    "eventAnnouncementId" bigint NOT NULL,
    "eventId" integer NOT NULL,
    title character varying(150) NOT NULL,
    message text NOT NULL,
    "levelCode" character varying(20) DEFAULT 'INFO'::character varying NOT NULL,
    "postedByUserId" integer NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: EventAnnouncements_eventAnnouncementId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventAnnouncements" ALTER COLUMN "eventAnnouncementId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."EventAnnouncements_eventAnnouncementId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventAudienceRules; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventAudienceRules" (
    "eventAudienceRuleId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    "academicTermId" bigint NOT NULL,
    "audienceScopeCode" character varying(20) NOT NULL,
    "academicProgramId" bigint,
    "sectionId" bigint,
    "yearLevel" smallint,
    "studentId" bigint,
    "isRequired" boolean DEFAULT true NOT NULL,
    "createdByUserId" integer NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_event_audience_rules_scope CHECK ((((("audienceScopeCode")::text = 'ALL_STUDENTS'::text) AND ("academicProgramId" IS NULL) AND ("sectionId" IS NULL) AND ("yearLevel" IS NULL) AND ("studentId" IS NULL)) OR ((("audienceScopeCode")::text = 'PROGRAM'::text) AND ("academicProgramId" IS NOT NULL) AND ("sectionId" IS NULL) AND ("yearLevel" IS NULL) AND ("studentId" IS NULL)) OR ((("audienceScopeCode")::text = 'YEAR_LEVEL'::text) AND ("academicProgramId" IS NULL) AND ("sectionId" IS NULL) AND ("yearLevel" IS NOT NULL) AND ("studentId" IS NULL)) OR ((("audienceScopeCode")::text = 'SECTION'::text) AND ("academicProgramId" IS NOT NULL) AND ("sectionId" IS NOT NULL) AND ("yearLevel" IS NOT NULL) AND ("studentId" IS NULL)) OR ((("audienceScopeCode")::text = 'STUDENT'::text) AND ("academicProgramId" IS NULL) AND ("sectionId" IS NULL) AND ("yearLevel" IS NULL) AND ("studentId" IS NOT NULL)))),
    CONSTRAINT ck_event_audience_rules_year CHECK ((("yearLevel" IS NULL) OR (("yearLevel" >= 1) AND ("yearLevel" <= 20))))
);


--
-- Name: EventAudienceRules_eventAudienceRuleId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventAudienceRules" ALTER COLUMN "eventAudienceRuleId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventAudienceRules_eventAudienceRuleId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventFinePolicies; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventFinePolicies" (
    "eventFinePolicyId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    "sourceFinePolicyTemplateVersionId" bigint,
    "policyCode" character varying(50) NOT NULL,
    "policyName" character varying(200) NOT NULL,
    "currencyCode" character varying(3) DEFAULT 'PHP'::character varying NOT NULL,
    "maximumFinePerStudent" numeric(12,2),
    "policyStatusCode" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    "createdByUserId" integer NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "activatedAtUtc" timestamp with time zone,
    CONSTRAINT ck_event_fine_policies_max_fine CHECK ((("maximumFinePerStudent" IS NULL) OR ("maximumFinePerStudent" >= (0)::numeric))),
    CONSTRAINT ck_event_fine_policies_status CHECK ((("policyStatusCode")::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'CLOSED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: EventFinePolicies_eventFinePolicyId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventFinePolicies" ALTER COLUMN "eventFinePolicyId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventFinePolicies_eventFinePolicyId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventFineRuleOverrides; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventFineRuleOverrides" (
    "eventFineRuleOverrideId" bigint NOT NULL,
    "eventFineRuleId" bigint NOT NULL,
    "fineAmount" numeric(12,2) NOT NULL,
    "overrideReason" character varying(500) NOT NULL,
    "overriddenByUserId" integer NOT NULL,
    "overriddenAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_event_fine_rule_overrides_amount CHECK (("fineAmount" >= (0)::numeric))
);


--
-- Name: EventFineRuleOverrides_eventFineRuleOverrideId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventFineRuleOverrides" ALTER COLUMN "eventFineRuleOverrideId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventFineRuleOverrides_eventFineRuleOverrideId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventFineRules; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventFineRules" (
    "eventFineRuleId" bigint NOT NULL,
    "eventFinePolicyId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    "eventSessionId" bigint NOT NULL,
    "sourceFinePolicyTemplateRuleId" bigint,
    "violationCode" character varying(30) NOT NULL,
    "fineAmount" numeric(12,2) NOT NULL,
    "priorityOrder" smallint DEFAULT 100 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_event_fine_rules_amount CHECK (("fineAmount" >= (0)::numeric))
);


--
-- Name: EventFineRules_eventFineRuleId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventFineRules" ALTER COLUMN "eventFineRuleId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventFineRules_eventFineRuleId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventParticipantQrCredentials; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventParticipantQrCredentials" (
    "eventParticipantQrCredentialId" bigint CONSTRAINT "EventParticipantQrCredentia_eventParticipantQrCredenti_not_null" NOT NULL,
    "eventRegistrationId" bigint NOT NULL,
    "tokenHash" bytea NOT NULL,
    "issuedByUserId" integer NOT NULL,
    "issuedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "expiresAtUtc" timestamp with time zone,
    "revokedByUserId" integer,
    "revokedAtUtc" timestamp with time zone,
    "revocationReason" character varying(500),
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT ck_event_participant_qr_credentials_expiry CHECK ((("expiresAtUtc" IS NULL) OR ("expiresAtUtc" > "issuedAtUtc"))),
    CONSTRAINT ck_event_participant_qr_credentials_revoke CHECK (((("revokedAtUtc" IS NULL) AND ("revokedByUserId" IS NULL) AND ("revocationReason" IS NULL)) OR (("revokedAtUtc" IS NOT NULL) AND ("revokedByUserId" IS NOT NULL) AND ("revocationReason" IS NOT NULL) AND (length(TRIM(BOTH FROM "revocationReason")) > 0))))
);


--
-- Name: EventParticipantQrCredentials_eventParticipantQrCredentialI_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventParticipantQrCredentials" ALTER COLUMN "eventParticipantQrCredentialId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventParticipantQrCredentials_eventParticipantQrCredentialI_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventParticipants_eventParticipantId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventParticipants" ALTER COLUMN "eventParticipantId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."EventParticipants_eventParticipantId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventRegistrations; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventRegistrations" (
    "eventRegistrationId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    "studentEnrollmentId" bigint NOT NULL,
    "studentId" bigint NOT NULL,
    "isRequired" boolean DEFAULT true NOT NULL,
    "registrationStatusCode" character varying(12) DEFAULT 'ACTIVE'::character varying NOT NULL,
    "sourceAudienceRuleId" bigint,
    "registeredByUserId" integer NOT NULL,
    "registeredAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_event_registrations_status CHECK ((("registrationStatusCode")::text = ANY ((ARRAY['ACTIVE'::character varying, 'EXEMPTED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: EventRegistrations_eventRegistrationId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventRegistrations" ALTER COLUMN "eventRegistrationId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventRegistrations_eventRegistrationId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventSessionQrTokens; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventSessionQrTokens" (
    "eventSessionQrTokenId" bigint NOT NULL,
    "eventSessionId" bigint NOT NULL,
    "actionCode" character varying(4) NOT NULL,
    "tokenHash" bytea NOT NULL,
    "validFromUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "expiresAtUtc" timestamp with time zone NOT NULL,
    "issuedByUserId" integer NOT NULL,
    "issuedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "revokedAtUtc" timestamp with time zone,
    "revokedByUserId" integer,
    "revocationReason" character varying(500),
    CONSTRAINT ck_event_session_qr_tokens_action CHECK ((("actionCode")::text = ANY ((ARRAY['IN'::character varying, 'OUT'::character varying, 'AUTO'::character varying])::text[]))),
    CONSTRAINT ck_event_session_qr_tokens_revoke CHECK (((("revokedAtUtc" IS NULL) AND ("revokedByUserId" IS NULL) AND ("revocationReason" IS NULL)) OR (("revokedAtUtc" IS NOT NULL) AND ("revokedByUserId" IS NOT NULL) AND ("revocationReason" IS NOT NULL) AND (char_length(btrim(("revocationReason")::text)) > 0)))),
    CONSTRAINT ck_event_session_qr_tokens_validity CHECK (("validFromUtc" < "expiresAtUtc"))
);


--
-- Name: EventSessionQrTokens_eventSessionQrTokenId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventSessionQrTokens" ALTER COLUMN "eventSessionQrTokenId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."EventSessionQrTokens_eventSessionQrTokenId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: EventSessions_eventSessionId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."EventSessions" ALTER COLUMN "eventSessionId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."EventSessions_eventSessionId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Events; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."Events" (
    "eventId" bigint NOT NULL,
    "academicTermId" bigint NOT NULL,
    "eventCode" character varying(50) NOT NULL,
    "eventName" character varying(200) NOT NULL,
    description character varying(2000),
    venue character varying(300),
    "eventStartDate" date CONSTRAINT "Events_eventDate_not_null" NOT NULL,
    "eventStatusCode" character varying(12) DEFAULT 'DRAFT'::character varying NOT NULL,
    "createdByUserId" integer NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "updatedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    "eventEndDate" date NOT NULL,
    CONSTRAINT ck_events_status CHECK ((("eventStatusCode")::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'CLOSED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: Events_eventId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."Events" ALTER COLUMN "eventId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."Events_eventId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ExternalLogins; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."ExternalLogins" (
    "externalLoginId" bigint NOT NULL,
    "userId" integer NOT NULL,
    "authProviderId" integer NOT NULL,
    "providerKey" character varying(255) NOT NULL,
    email character varying(320),
    "displayName" character varying(200),
    "linkedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "lastUsedAtUtc" timestamp(3) with time zone,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_external_logins_key CHECK ((char_length(btrim(("providerKey")::text)) > 0))
);


--
-- Name: ExternalLogins_externalLoginId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."ExternalLogins" ALTER COLUMN "externalLoginId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."ExternalLogins_externalLoginId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FinePaymentAllocations; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."FinePaymentAllocations" (
    "finePaymentAllocationId" bigint NOT NULL,
    "finePaymentId" bigint NOT NULL,
    "studentFineAssessmentId" bigint NOT NULL,
    "allocatedAmount" numeric(12,2) NOT NULL,
    "allocatedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_fine_payment_allocations_amount CHECK (("allocatedAmount" > (0)::numeric))
);


--
-- Name: FinePaymentAllocations_finePaymentAllocationId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."FinePaymentAllocations" ALTER COLUMN "finePaymentAllocationId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."FinePaymentAllocations_finePaymentAllocationId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FinePayments; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."FinePayments" (
    "finePaymentId" bigint NOT NULL,
    "paymentReference" character varying(100) NOT NULL,
    "paymentMethodCode" character varying(30) NOT NULL,
    "totalAmount" numeric(12,2) NOT NULL,
    "paymentStatusCode" character varying(20) DEFAULT 'CONFIRMED'::character varying NOT NULL,
    "receivedByUserId" integer NOT NULL,
    "receivedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "externalPaymentReference" character varying(100),
    "voidedByUserId" integer,
    "voidedAtUtc" timestamp with time zone,
    "voidReason" character varying(1000),
    CONSTRAINT ck_fine_payments_amount CHECK (("totalAmount" > (0)::numeric)),
    CONSTRAINT ck_fine_payments_method CHECK ((("paymentMethodCode")::text = ANY ((ARRAY['CASH'::character varying, 'GCASH'::character varying, 'BANK_TRANSFER'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT ck_fine_payments_status CHECK ((("paymentStatusCode")::text = ANY ((ARRAY['PENDING'::character varying, 'CONFIRMED'::character varying, 'VOIDED'::character varying, 'REFUNDED'::character varying])::text[]))),
    CONSTRAINT ck_fine_payments_void CHECK ((((("paymentStatusCode")::text <> 'VOIDED'::text) AND ("voidedByUserId" IS NULL) AND ("voidedAtUtc" IS NULL) AND ("voidReason" IS NULL)) OR ((("paymentStatusCode")::text = 'VOIDED'::text) AND ("voidedByUserId" IS NOT NULL) AND ("voidedAtUtc" IS NOT NULL) AND ("voidReason" IS NOT NULL) AND (length(TRIM(BOTH FROM "voidReason")) > 0))))
);


--
-- Name: FinePayments_finePaymentId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."FinePayments" ALTER COLUMN "finePaymentId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."FinePayments_finePaymentId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FinePolicyTemplateRules; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."FinePolicyTemplateRules" (
    "finePolicyTemplateRuleId" bigint NOT NULL,
    "finePolicyTemplateVersionId" bigint NOT NULL,
    "sessionTypeCode" character varying(20) DEFAULT 'GENERAL'::character varying NOT NULL,
    "violationCode" character varying(30) NOT NULL,
    "fineAmount" numeric(12,2) NOT NULL,
    "priorityOrder" smallint DEFAULT 100 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_fine_policy_template_rules_amount CHECK (("fineAmount" >= (0)::numeric))
);


--
-- Name: FinePolicyTemplateRules_finePolicyTemplateRuleId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."FinePolicyTemplateRules" ALTER COLUMN "finePolicyTemplateRuleId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."FinePolicyTemplateRules_finePolicyTemplateRuleId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FinePolicyTemplateVersions; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."FinePolicyTemplateVersions" (
    "finePolicyTemplateVersionId" bigint NOT NULL,
    "finePolicyTemplateId" bigint NOT NULL,
    "versionNumber" integer NOT NULL,
    "versionStatusCode" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    "currencyCode" character varying(3) DEFAULT 'PHP'::character varying NOT NULL,
    "maximumFinePerStudent" numeric(12,2),
    "createdByUserId" integer NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "publishedAtUtc" timestamp with time zone,
    "retiredAtUtc" timestamp with time zone,
    CONSTRAINT ck_fine_policy_template_versions_max_fine CHECK ((("maximumFinePerStudent" IS NULL) OR ("maximumFinePerStudent" >= (0)::numeric))),
    CONSTRAINT ck_fine_policy_template_versions_status CHECK ((("versionStatusCode")::text = ANY ((ARRAY['DRAFT'::character varying, 'PUBLISHED'::character varying, 'RETIRED'::character varying])::text[])))
);


--
-- Name: FinePolicyTemplateVersions_finePolicyTemplateVersionId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."FinePolicyTemplateVersions" ALTER COLUMN "finePolicyTemplateVersionId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."FinePolicyTemplateVersions_finePolicyTemplateVersionId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FinePolicyTemplates; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."FinePolicyTemplates" (
    "finePolicyTemplateId" bigint NOT NULL,
    "templateCode" character varying(50) NOT NULL,
    "templateName" character varying(150) NOT NULL,
    description character varying(500),
    "isActive" boolean DEFAULT true NOT NULL,
    "createdByUserId" integer NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "updatedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: FinePolicyTemplates_finePolicyTemplateId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."FinePolicyTemplates" ALTER COLUMN "finePolicyTemplateId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."FinePolicyTemplates_finePolicyTemplateId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: FineWaiverRequests; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."FineWaiverRequests" (
    "fineWaiverRequestId" bigint NOT NULL,
    "studentFineAssessmentId" bigint NOT NULL,
    "waiverReason" character varying(1000) NOT NULL,
    "requestStatusCode" character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    "requestedByUserId" integer NOT NULL,
    "requestedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "reviewedByUserId" integer,
    "reviewedAtUtc" timestamp with time zone,
    "reviewNotes" character varying(1000),
    CONSTRAINT ck_fine_waiver_requests_status CHECK ((("requestStatusCode")::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: FineWaiverRequests_fineWaiverRequestId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."FineWaiverRequests" ALTER COLUMN "fineWaiverRequestId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."FineWaiverRequests_fineWaiverRequestId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Sections; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."Sections" (
    "sectionId" bigint NOT NULL,
    "academicTermId" bigint NOT NULL,
    "academicProgramId" bigint NOT NULL,
    "yearLevel" smallint NOT NULL,
    "sectionCode" character varying(30) NOT NULL,
    "sectionName" character varying(100) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_sections_year_level CHECK ((("yearLevel" >= 1) AND ("yearLevel" <= 20)))
);


--
-- Name: Sections_sectionId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."Sections" ALTER COLUMN "sectionId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."Sections_sectionId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: StudentEnrollments; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."StudentEnrollments" (
    "studentEnrollmentId" bigint NOT NULL,
    "studentId" bigint NOT NULL,
    "academicTermId" bigint NOT NULL,
    "academicProgramId" bigint NOT NULL,
    "sectionId" bigint,
    "yearLevel" smallint NOT NULL,
    "enrollmentStatusCode" character varying(15) DEFAULT 'ENROLLED'::character varying NOT NULL,
    "effectiveFromUtc" timestamp(3) with time zone NOT NULL,
    "effectiveToUtc" timestamp(3) with time zone,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_student_enrollments_dates CHECK ((("effectiveToUtc" IS NULL) OR ("effectiveToUtc" > "effectiveFromUtc"))),
    CONSTRAINT ck_student_enrollments_status CHECK ((("enrollmentStatusCode")::text = ANY ((ARRAY['ENROLLED'::character varying, 'WITHDRAWN'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT ck_student_enrollments_year CHECK ((("yearLevel" >= 1) AND ("yearLevel" <= 20)))
);


--
-- Name: StudentEnrollments_studentEnrollmentId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."StudentEnrollments" ALTER COLUMN "studentEnrollmentId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."StudentEnrollments_studentEnrollmentId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: StudentFineAssessments; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."StudentFineAssessments" (
    "studentFineAssessmentId" bigint NOT NULL,
    "eventParticipantId" bigint NOT NULL,
    "eventSessionId" bigint NOT NULL,
    "violationCode" character varying(30) NOT NULL,
    "assessedAmount" numeric(12,2) NOT NULL,
    "currencyCode" character varying(3) DEFAULT 'PHP'::character varying NOT NULL,
    "assessmentStatusCode" character varying(20) DEFAULT 'ASSESSED'::character varying NOT NULL,
    "assessedByUserId" integer NOT NULL,
    "assessedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_student_fine_assessments_amount CHECK (("assessedAmount" >= (0)::numeric)),
    CONSTRAINT ck_student_fine_assessments_status CHECK ((("assessmentStatusCode")::text = ANY ((ARRAY['ASSESSED'::character varying, 'PARTIALLY_PAID'::character varying, 'PAID'::character varying, 'WAIVED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: StudentFineAssessments_studentFineAssessmentId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."StudentFineAssessments" ALTER COLUMN "studentFineAssessmentId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."StudentFineAssessments_studentFineAssessmentId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: StudentFineStatusHistory; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."StudentFineStatusHistory" (
    "studentFineStatusHistoryId" bigint NOT NULL,
    "studentFineAssessmentId" bigint NOT NULL,
    "fromStatusCode" character varying(20),
    "toStatusCode" character varying(20) NOT NULL,
    "changeReason" character varying(1000) NOT NULL,
    "changedByUserId" integer NOT NULL,
    "changedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: StudentFineStatusHistory_studentFineStatusHistoryId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."StudentFineStatusHistory" ALTER COLUMN "studentFineStatusHistoryId" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME ssc."StudentFineStatusHistory_studentFineStatusHistoryId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: StudentUserLinks; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."StudentUserLinks" (
    "userId" integer NOT NULL,
    "studentId" bigint NOT NULL,
    "linkedByUserId" integer,
    "linkedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_student_user_links_different_linker CHECK ((("linkedByUserId" IS NULL) OR ("linkedByUserId" <> "userId")))
);


--
-- Name: Students; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."Students" (
    "studentId" bigint NOT NULL,
    "studentNumber" character varying(50) NOT NULL,
    "userId" integer,
    "firstName" character varying(100) NOT NULL,
    "middleName" character varying(100),
    "lastName" character varying(100) NOT NULL,
    suffix character varying(30),
    "photoUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "updatedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    CONSTRAINT ck_students_name CHECK (((char_length(btrim(("firstName")::text)) > 0) AND (char_length(btrim(("lastName")::text)) > 0))),
    CONSTRAINT ck_students_number CHECK ((char_length(btrim(("studentNumber")::text)) > 0))
);


--
-- Name: Students_studentId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."Students" ALTER COLUMN "studentId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."Students_studentId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: Users; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."Users" (
    "userId" integer NOT NULL,
    username character varying(100) NOT NULL,
    "passwordHash" text NOT NULL,
    "displayName" character varying(200) NOT NULL,
    role character varying(20) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "updatedAtUtc" timestamp(3) with time zone DEFAULT clock_timestamp() NOT NULL,
    "rowVersion" bytea DEFAULT ssc.new_row_version() NOT NULL,
    "externalSubject" character varying(200),
    "canManageAttendance" boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_users_name CHECK ((char_length(btrim(("displayName")::text)) > 0)),
    CONSTRAINT ck_users_role CHECK (((role)::text = ANY ((ARRAY['superadmin'::character varying, 'moderator'::character varying, 'student'::character varying])::text[]))),
    CONSTRAINT ck_users_username CHECK ((char_length(btrim((username)::text)) > 0))
);


--
-- Name: Users_userId_seq; Type: SEQUENCE; Schema: ssc; Owner: -
--

ALTER TABLE ssc."Users" ALTER COLUMN "userId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."Users_userId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: VwEventAttendance; Type: VIEW; Schema: ssc; Owner: -
--

CREATE VIEW ssc."VwEventAttendance" AS
 SELECT e."eventId",
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
            WHEN ((a."checkedOutAtUtc" IS NOT NULL) AND (a."checkedInAtUtc" IS NOT NULL)) THEN round((EXTRACT(epoch FROM (a."checkedOutAtUtc" - a."checkedInAtUtc")) / 60.0), 2)
            ELSE NULL::numeric
        END AS "attendedMinutes",
    ((a."checkedInAtUtc" IS NOT NULL) AND (a."checkedInAtUtc" > s."lateAfterUtc")) AS "isLate",
        CASE
            WHEN ((e."eventStatusCode")::text = 'CANCELLED'::text) THEN 'CANCELLED'::text
            WHEN (a."isExcused" = true) THEN 'EXCUSED'::text
            WHEN (a."checkedInAtUtc" IS NULL) THEN
            CASE
                WHEN ((s."isClosed" = true) OR ((e."eventStatusCode")::text = 'CLOSED'::text)) THEN
                CASE
                    WHEN (p."isRequired" = true) THEN 'ABSENT'::text
                    ELSE 'NOT_ATTENDED'::text
                END
                ELSE 'NOT_YET_RECORDED'::text
            END
            WHEN (a."checkedInAtUtc" > s."lateAfterUtc") THEN 'LATE'::text
            WHEN ((s."requiresCheckOut" = true) AND (a."checkedOutAtUtc" IS NULL)) THEN
            CASE
                WHEN ((s."isClosed" = true) OR ((e."eventStatusCode")::text = 'CLOSED'::text)) THEN 'INCOMPLETE'::text
                ELSE 'CHECKED_IN'::text
            END
            WHEN ((s."requiresCheckOut" = true) AND (EXTRACT(epoch FROM (a."checkedOutAtUtc" - a."checkedInAtUtc")) < ((s."minimumMinutes" * 60))::numeric)) THEN 'INCOMPLETE'::text
            ELSE 'PRESENT'::text
        END AS "attendanceStatus"
   FROM ((((ssc."EventParticipants" p
     JOIN ssc."EventSessions" s ON ((s."eventSessionId" = p."eventSessionId")))
     JOIN ssc."Events" e ON ((e."eventId" = s."eventId")))
     JOIN ssc."Students" st ON ((st."studentId" = p."studentId")))
     LEFT JOIN ssc."AttendanceRecords" a ON ((a."eventParticipantId" = p."eventParticipantId")));


--
-- Name: VwStudentFineBalances; Type: VIEW; Schema: ssc; Owner: -
--

CREATE VIEW ssc."VwStudentFineBalances" AS
 SELECT a."studentFineAssessmentId",
    p."studentId",
    st."studentNumber",
    a."eventSessionId",
    a."violationCode",
    a."assessedAmount",
    a."currencyCode",
    a."assessmentStatusCode",
    COALESCE(pay.paid, 0.00) AS "confirmedPaidAmount",
        CASE
            WHEN ((a."assessmentStatusCode")::text = ANY ((ARRAY['WAIVED'::character varying, 'CANCELLED'::character varying])::text[])) THEN 0.00
            ELSE GREATEST(0.00, (a."assessedAmount" - COALESCE(pay.paid, 0.00)))
        END AS "outstandingAmount"
   FROM (((ssc."StudentFineAssessments" a
     JOIN ssc."EventParticipants" p ON ((p."eventParticipantId" = a."eventParticipantId")))
     JOIN ssc."Students" st ON ((st."studentId" = p."studentId")))
     LEFT JOIN LATERAL ( SELECT sum(pa."allocatedAmount") AS paid
           FROM (ssc."FinePaymentAllocations" pa
             JOIN ssc."FinePayments" fp ON ((fp."finePaymentId" = pa."finePaymentId")))
          WHERE ((pa."studentFineAssessmentId" = a."studentFineAssessmentId") AND ((fp."paymentStatusCode")::text = 'CONFIRMED'::text))) pay ON (true));


--
-- Name: AcademicPrograms AcademicPrograms_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicPrograms"
    ADD CONSTRAINT "AcademicPrograms_pkey" PRIMARY KEY ("academicProgramId");


--
-- Name: AcademicTerms AcademicTerms_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicTerms"
    ADD CONSTRAINT "AcademicTerms_pkey" PRIMARY KEY ("academicTermId");


--
-- Name: AcademicYears AcademicYears_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicYears"
    ADD CONSTRAINT "AcademicYears_pkey" PRIMARY KEY ("academicYearId");


--
-- Name: AttendanceCorrections AttendanceCorrections_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceCorrections"
    ADD CONSTRAINT "AttendanceCorrections_pkey" PRIMARY KEY ("attendanceCorrectionId");


--
-- Name: AttendanceDevices AttendanceDevices_deviceCode_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceDevices"
    ADD CONSTRAINT "AttendanceDevices_deviceCode_key" UNIQUE ("deviceCode");


--
-- Name: AttendanceDevices AttendanceDevices_deviceFingerprintHash_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceDevices"
    ADD CONSTRAINT "AttendanceDevices_deviceFingerprintHash_key" UNIQUE ("deviceFingerprintHash");


--
-- Name: AttendanceDevices AttendanceDevices_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceDevices"
    ADD CONSTRAINT "AttendanceDevices_pkey" PRIMARY KEY ("attendanceDeviceId");


--
-- Name: AttendanceLogs AttendanceLogs_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceLogs"
    ADD CONSTRAINT "AttendanceLogs_pkey" PRIMARY KEY ("attendanceLogId");


--
-- Name: AttendanceRecords AttendanceRecords_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceRecords"
    ADD CONSTRAINT "AttendanceRecords_pkey" PRIMARY KEY ("attendanceRecordId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_pkey" PRIMARY KEY ("attendanceScanAttemptId");


--
-- Name: AuthProviders AuthProviders_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AuthProviders"
    ADD CONSTRAINT "AuthProviders_pkey" PRIMARY KEY ("authProviderId");


--
-- Name: EventAnnouncements EventAnnouncements_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAnnouncements"
    ADD CONSTRAINT "EventAnnouncements_pkey" PRIMARY KEY ("eventAnnouncementId");


--
-- Name: EventAudienceRules EventAudienceRules_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT "EventAudienceRules_pkey" PRIMARY KEY ("eventAudienceRuleId");


--
-- Name: EventFinePolicies EventFinePolicies_eventId_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFinePolicies"
    ADD CONSTRAINT "EventFinePolicies_eventId_key" UNIQUE ("eventId");


--
-- Name: EventFinePolicies EventFinePolicies_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFinePolicies"
    ADD CONSTRAINT "EventFinePolicies_pkey" PRIMARY KEY ("eventFinePolicyId");


--
-- Name: EventFineRuleOverrides EventFineRuleOverrides_eventFineRuleId_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRuleOverrides"
    ADD CONSTRAINT "EventFineRuleOverrides_eventFineRuleId_key" UNIQUE ("eventFineRuleId");


--
-- Name: EventFineRuleOverrides EventFineRuleOverrides_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRuleOverrides"
    ADD CONSTRAINT "EventFineRuleOverrides_pkey" PRIMARY KEY ("eventFineRuleOverrideId");


--
-- Name: EventFineRules EventFineRules_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRules"
    ADD CONSTRAINT "EventFineRules_pkey" PRIMARY KEY ("eventFineRuleId");


--
-- Name: EventParticipantQrCredentials EventParticipantQrCredentials_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipantQrCredentials"
    ADD CONSTRAINT "EventParticipantQrCredentials_pkey" PRIMARY KEY ("eventParticipantQrCredentialId");


--
-- Name: EventParticipantQrCredentials EventParticipantQrCredentials_tokenHash_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipantQrCredentials"
    ADD CONSTRAINT "EventParticipantQrCredentials_tokenHash_key" UNIQUE ("tokenHash");


--
-- Name: EventParticipants EventParticipants_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT "EventParticipants_pkey" PRIMARY KEY ("eventParticipantId");


--
-- Name: EventRegistrations EventRegistrations_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT "EventRegistrations_pkey" PRIMARY KEY ("eventRegistrationId");


--
-- Name: EventSessionQrTokens EventSessionQrTokens_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessionQrTokens"
    ADD CONSTRAINT "EventSessionQrTokens_pkey" PRIMARY KEY ("eventSessionQrTokenId");


--
-- Name: EventSessions EventSessions_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessions"
    ADD CONSTRAINT "EventSessions_pkey" PRIMARY KEY ("eventSessionId");


--
-- Name: Events Events_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Events"
    ADD CONSTRAINT "Events_pkey" PRIMARY KEY ("eventId");


--
-- Name: ExternalLogins ExternalLogins_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."ExternalLogins"
    ADD CONSTRAINT "ExternalLogins_pkey" PRIMARY KEY ("externalLoginId");


--
-- Name: FinePaymentAllocations FinePaymentAllocations_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePaymentAllocations"
    ADD CONSTRAINT "FinePaymentAllocations_pkey" PRIMARY KEY ("finePaymentAllocationId");


--
-- Name: FinePayments FinePayments_paymentReference_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePayments"
    ADD CONSTRAINT "FinePayments_paymentReference_key" UNIQUE ("paymentReference");


--
-- Name: FinePayments FinePayments_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePayments"
    ADD CONSTRAINT "FinePayments_pkey" PRIMARY KEY ("finePaymentId");


--
-- Name: FinePolicyTemplateRules FinePolicyTemplateRules_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateRules"
    ADD CONSTRAINT "FinePolicyTemplateRules_pkey" PRIMARY KEY ("finePolicyTemplateRuleId");


--
-- Name: FinePolicyTemplateVersions FinePolicyTemplateVersions_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateVersions"
    ADD CONSTRAINT "FinePolicyTemplateVersions_pkey" PRIMARY KEY ("finePolicyTemplateVersionId");


--
-- Name: FinePolicyTemplates FinePolicyTemplates_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplates"
    ADD CONSTRAINT "FinePolicyTemplates_pkey" PRIMARY KEY ("finePolicyTemplateId");


--
-- Name: FinePolicyTemplates FinePolicyTemplates_templateCode_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplates"
    ADD CONSTRAINT "FinePolicyTemplates_templateCode_key" UNIQUE ("templateCode");


--
-- Name: FineWaiverRequests FineWaiverRequests_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FineWaiverRequests"
    ADD CONSTRAINT "FineWaiverRequests_pkey" PRIMARY KEY ("fineWaiverRequestId");


--
-- Name: Sections Sections_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Sections"
    ADD CONSTRAINT "Sections_pkey" PRIMARY KEY ("sectionId");


--
-- Name: StudentEnrollments StudentEnrollments_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT "StudentEnrollments_pkey" PRIMARY KEY ("studentEnrollmentId");


--
-- Name: StudentFineAssessments StudentFineAssessments_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineAssessments"
    ADD CONSTRAINT "StudentFineAssessments_pkey" PRIMARY KEY ("studentFineAssessmentId");


--
-- Name: StudentFineStatusHistory StudentFineStatusHistory_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineStatusHistory"
    ADD CONSTRAINT "StudentFineStatusHistory_pkey" PRIMARY KEY ("studentFineStatusHistoryId");


--
-- Name: Students Students_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Students"
    ADD CONSTRAINT "Students_pkey" PRIMARY KEY ("studentId");


--
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY ("userId");


--
-- Name: StudentUserLinks pk_student_user_links; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentUserLinks"
    ADD CONSTRAINT pk_student_user_links PRIMARY KEY ("userId");


--
-- Name: AcademicPrograms uq_academic_programs_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicPrograms"
    ADD CONSTRAINT uq_academic_programs_code UNIQUE ("programCode");


--
-- Name: AcademicTerms uq_academic_terms_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicTerms"
    ADD CONSTRAINT uq_academic_terms_code UNIQUE ("academicYearId", "termCode");


--
-- Name: AcademicYears uq_academic_years_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicYears"
    ADD CONSTRAINT uq_academic_years_code UNIQUE ("yearCode");


--
-- Name: AttendanceCorrections uq_attendance_corrections_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceCorrections"
    ADD CONSTRAINT uq_attendance_corrections_context UNIQUE ("attendanceRecordId", "attendanceCorrectionId");


--
-- Name: AttendanceRecords uq_attendance_records_participant; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceRecords"
    ADD CONSTRAINT uq_attendance_records_participant UNIQUE ("eventParticipantId");


--
-- Name: AuthProviders uq_auth_providers_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AuthProviders"
    ADD CONSTRAINT uq_auth_providers_code UNIQUE ("providerCode");


--
-- Name: EventAudienceRules uq_event_audience_rules_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT uq_event_audience_rules_context UNIQUE ("eventId", "audienceScopeCode", "academicProgramId", "sectionId", "yearLevel", "studentId");


--
-- Name: EventFinePolicies uq_event_fine_policies_event_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFinePolicies"
    ADD CONSTRAINT uq_event_fine_policies_event_context UNIQUE ("eventFinePolicyId", "eventId");


--
-- Name: EventFineRules uq_event_fine_rules_session_violation; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRules"
    ADD CONSTRAINT uq_event_fine_rules_session_violation UNIQUE ("eventFinePolicyId", "eventSessionId", "violationCode");


--
-- Name: EventParticipants uq_event_participants_session_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT uq_event_participants_session_context UNIQUE ("eventParticipantId", "eventSessionId");


--
-- Name: EventParticipants uq_event_participants_student_session; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT uq_event_participants_student_session UNIQUE ("eventSessionId", "studentId");


--
-- Name: EventRegistrations uq_event_registrations_event_student; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT uq_event_registrations_event_student UNIQUE ("eventId", "studentId");


--
-- Name: EventSessionQrTokens uq_event_session_qr_tokens_hash; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessionQrTokens"
    ADD CONSTRAINT uq_event_session_qr_tokens_hash UNIQUE ("tokenHash");


--
-- Name: EventSessions uq_event_sessions_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessions"
    ADD CONSTRAINT uq_event_sessions_code UNIQUE ("eventId", "sessionCode");


--
-- Name: EventSessions uq_event_sessions_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessions"
    ADD CONSTRAINT uq_event_sessions_context UNIQUE ("eventSessionId", "academicTermId");


--
-- Name: EventSessions uq_event_sessions_event_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessions"
    ADD CONSTRAINT uq_event_sessions_event_context UNIQUE ("eventSessionId", "eventId");


--
-- Name: EventSessions uq_event_sessions_type_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessions"
    ADD CONSTRAINT uq_event_sessions_type_context UNIQUE ("eventSessionId", "eventId", "sessionTypeCode");


--
-- Name: Events uq_events_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Events"
    ADD CONSTRAINT uq_events_code UNIQUE ("eventCode");


--
-- Name: Events uq_events_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Events"
    ADD CONSTRAINT uq_events_context UNIQUE ("eventId", "academicTermId");


--
-- Name: ExternalLogins uq_external_logins_provider_key; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."ExternalLogins"
    ADD CONSTRAINT uq_external_logins_provider_key UNIQUE ("authProviderId", "providerKey");


--
-- Name: ExternalLogins uq_external_logins_user_provider; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."ExternalLogins"
    ADD CONSTRAINT uq_external_logins_user_provider UNIQUE ("userId", "authProviderId");


--
-- Name: FinePaymentAllocations uq_fine_payment_allocations_assessment; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePaymentAllocations"
    ADD CONSTRAINT uq_fine_payment_allocations_assessment UNIQUE ("finePaymentId", "studentFineAssessmentId");


--
-- Name: FinePolicyTemplateRules uq_fine_policy_template_rules_unique; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateRules"
    ADD CONSTRAINT uq_fine_policy_template_rules_unique UNIQUE ("finePolicyTemplateVersionId", "sessionTypeCode", "violationCode");


--
-- Name: FinePolicyTemplateVersions uq_fine_policy_template_versions_num; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateVersions"
    ADD CONSTRAINT uq_fine_policy_template_versions_num UNIQUE ("finePolicyTemplateId", "versionNumber");


--
-- Name: Sections uq_sections_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Sections"
    ADD CONSTRAINT uq_sections_code UNIQUE ("academicTermId", "academicProgramId", "yearLevel", "sectionCode");


--
-- Name: Sections uq_sections_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Sections"
    ADD CONSTRAINT uq_sections_context UNIQUE ("academicTermId", "academicProgramId", "yearLevel", "sectionId");


--
-- Name: Sections uq_sections_term_program_year_code; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Sections"
    ADD CONSTRAINT uq_sections_term_program_year_code UNIQUE ("academicTermId", "academicProgramId", "yearLevel", "sectionCode");


--
-- Name: StudentEnrollments uq_student_enrollments_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT uq_student_enrollments_context UNIQUE ("academicTermId", "studentEnrollmentId", "studentId");


--
-- Name: StudentEnrollments uq_student_enrollments_student_term; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT uq_student_enrollments_student_term UNIQUE ("studentEnrollmentId", "studentId");


--
-- Name: StudentFineAssessments uq_student_fine_assessments_participant_violation; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineAssessments"
    ADD CONSTRAINT uq_student_fine_assessments_participant_violation UNIQUE ("eventParticipantId", "violationCode");


--
-- Name: StudentUserLinks uq_student_user_links_student; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentUserLinks"
    ADD CONSTRAINT uq_student_user_links_student UNIQUE ("studentId");


--
-- Name: Students uq_students_number; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Students"
    ADD CONSTRAINT uq_students_number UNIQUE ("studentNumber");


--
-- Name: Users uq_users_external_subject; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Users"
    ADD CONSTRAINT uq_users_external_subject UNIQUE ("externalSubject");


--
-- Name: Users uq_users_username; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Users"
    ADD CONSTRAINT uq_users_username UNIQUE (username);


--
-- Name: ix_attendance_corrections_queue; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_corrections_queue ON ssc."AttendanceCorrections" USING btree ("correctionStatusCode", "requestedAtUtc");


--
-- Name: ix_attendance_logs_lookup; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_logs_lookup ON ssc."AttendanceLogs" USING btree ("recordedAtUtc");


--
-- Name: ix_attendance_logs_record; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_logs_record ON ssc."AttendanceLogs" USING btree ("attendanceRecordId", "attendanceLogId");


--
-- Name: ix_attendance_scan_attempts_resolved_student_time; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_scan_attempts_resolved_student_time ON ssc."AttendanceScanAttempts" USING btree ("resolvedStudentId", "scannedAtUtc") WHERE ("resolvedStudentId" IS NOT NULL);


--
-- Name: ix_attendance_scan_attempts_session_time; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_scan_attempts_session_time ON ssc."AttendanceScanAttempts" USING btree ("eventSessionId", "scannedAtUtc");


--
-- Name: ix_attendance_scan_attempts_token_time; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_scan_attempts_token_time ON ssc."AttendanceScanAttempts" USING btree ("tokenHash", "scannedAtUtc");


--
-- Name: ix_attendance_scan_attempts_user_time; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_attendance_scan_attempts_user_time ON ssc."AttendanceScanAttempts" USING btree ("processedByUserId", "scannedAtUtc");


--
-- Name: ix_event_announcements_event; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_event_announcements_event ON ssc."EventAnnouncements" USING btree ("eventId", "createdAtUtc");


--
-- Name: ix_event_audience_rules_event; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_event_audience_rules_event ON ssc."EventAudienceRules" USING btree ("eventId");


--
-- Name: ix_event_participants_student; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_event_participants_student ON ssc."EventParticipants" USING btree ("studentId", "eventSessionId");


--
-- Name: ix_event_session_qr_tokens_hash; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_event_session_qr_tokens_hash ON ssc."EventSessionQrTokens" USING btree ("tokenHash");


--
-- Name: ix_event_session_qr_tokens_lookup; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_event_session_qr_tokens_lookup ON ssc."EventSessionQrTokens" USING btree ("eventSessionId", "actionCode", "expiresAtUtc") WHERE ("revokedAtUtc" IS NULL);


--
-- Name: ix_fine_payment_allocations_assessment; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_fine_payment_allocations_assessment ON ssc."FinePaymentAllocations" USING btree ("studentFineAssessmentId");


--
-- Name: ix_student_enrollments_roster; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_student_enrollments_roster ON ssc."StudentEnrollments" USING btree ("academicTermId", "academicProgramId", "sectionId") INCLUDE ("studentId", "studentEnrollmentId", "enrollmentStatusCode", "effectiveFromUtc", "effectiveToUtc");


--
-- Name: ix_student_fine_status_history_assessment; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_student_fine_status_history_assessment ON ssc."StudentFineStatusHistory" USING btree ("studentFineAssessmentId");


--
-- Name: ix_student_user_links_student; Type: INDEX; Schema: ssc; Owner: -
--

CREATE INDEX ix_student_user_links_student ON ssc."StudentUserLinks" USING btree ("studentId");


--
-- Name: ux_attendance_logs_one_checkin; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_attendance_logs_one_checkin ON ssc."AttendanceLogs" USING btree ("attendanceRecordId") WHERE ((("actionCode")::text = 'CHECK_IN'::text) AND ("isCancelled" = false));


--
-- Name: ux_attendance_logs_one_checkout; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_attendance_logs_one_checkout ON ssc."AttendanceLogs" USING btree ("attendanceRecordId") WHERE ((("actionCode")::text = 'CHECK_OUT'::text) AND ("isCancelled" = false));


--
-- Name: ux_attendance_scan_attempts_client_request; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_attendance_scan_attempts_client_request ON ssc."AttendanceScanAttempts" USING btree ("clientRequestId") WHERE ("clientRequestId" IS NOT NULL);


--
-- Name: ux_event_participant_qr_credentials_active; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_event_participant_qr_credentials_active ON ssc."EventParticipantQrCredentials" USING btree ("eventRegistrationId") WHERE ("revokedAtUtc" IS NULL);


--
-- Name: ux_event_participant_qr_credentials_token; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_event_participant_qr_credentials_token ON ssc."EventParticipantQrCredentials" USING btree (token);


--
-- Name: ux_event_participants_registration_session; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_event_participants_registration_session ON ssc."EventParticipants" USING btree ("eventRegistrationId", "eventSessionId") WHERE ("eventRegistrationId" IS NOT NULL);


--
-- Name: ux_fine_payments_external_ref; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_fine_payments_external_ref ON ssc."FinePayments" USING btree ("externalPaymentReference") WHERE ("externalPaymentReference" IS NOT NULL);


--
-- Name: ux_fine_waiver_requests_pending; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_fine_waiver_requests_pending ON ssc."FineWaiverRequests" USING btree ("studentFineAssessmentId") WHERE (("requestStatusCode")::text = 'PENDING'::text);


--
-- Name: ux_student_enrollments_current; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_student_enrollments_current ON ssc."StudentEnrollments" USING btree ("studentId", "academicTermId") WHERE ("effectiveToUtc" IS NULL);


--
-- Name: ux_students_login; Type: INDEX; Schema: ssc; Owner: -
--

CREATE UNIQUE INDEX ux_students_login ON ssc."Students" USING btree ("userId") WHERE ("userId" IS NOT NULL);


--
-- Name: AcademicTerms tr_academic_terms_dates; Type: TRIGGER; Schema: ssc; Owner: -
--

CREATE TRIGGER tr_academic_terms_dates BEFORE INSERT OR UPDATE ON ssc."AcademicTerms" FOR EACH ROW EXECUTE FUNCTION ssc.fn_tr_academic_terms_dates();


--
-- Name: AttendanceLogs tr_attendance_logs_append_only; Type: TRIGGER; Schema: ssc; Owner: -
--

CREATE TRIGGER tr_attendance_logs_append_only BEFORE DELETE OR UPDATE ON ssc."AttendanceLogs" FOR EACH ROW EXECUTE FUNCTION ssc.fn_tr_attendance_logs_append_only();


--
-- Name: Events tr_events_lifecycle; Type: TRIGGER; Schema: ssc; Owner: -
--

CREATE TRIGGER tr_events_lifecycle BEFORE INSERT OR UPDATE ON ssc."Events" FOR EACH ROW EXECUTE FUNCTION ssc.fn_tr_events_lifecycle();


--
-- Name: StudentEnrollments tr_student_enrollments_history; Type: TRIGGER; Schema: ssc; Owner: -
--

CREATE TRIGGER tr_student_enrollments_history BEFORE INSERT OR UPDATE ON ssc."StudentEnrollments" FOR EACH ROW EXECUTE FUNCTION ssc.fn_tr_student_enrollments_history();


--
-- Name: AttendanceDevices AttendanceDevices_assignedToUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceDevices"
    ADD CONSTRAINT "AttendanceDevices_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceDevices AttendanceDevices_registeredByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceDevices"
    ADD CONSTRAINT "AttendanceDevices_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_attendanceDeviceId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_attendanceDeviceId_fkey" FOREIGN KEY ("attendanceDeviceId") REFERENCES ssc."AttendanceDevices"("attendanceDeviceId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_eventParticipantId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_eventParticipantId_fkey" FOREIGN KEY ("eventParticipantId") REFERENCES ssc."EventParticipants"("eventParticipantId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_eventRegistrationId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES ssc."EventRegistrations"("eventRegistrationId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_eventSessionId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES ssc."EventSessions"("eventSessionId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_eventSessionQrTokenId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_eventSessionQrTokenId_fkey" FOREIGN KEY ("eventSessionQrTokenId") REFERENCES ssc."EventSessionQrTokens"("eventSessionQrTokenId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_processedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceScanAttempts AttendanceScanAttempts_resolvedStudentId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceScanAttempts"
    ADD CONSTRAINT "AttendanceScanAttempts_resolvedStudentId_fkey" FOREIGN KEY ("resolvedStudentId") REFERENCES ssc."Students"("studentId");


--
-- Name: EventAudienceRules EventAudienceRules_academicProgramId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT "EventAudienceRules_academicProgramId_fkey" FOREIGN KEY ("academicProgramId") REFERENCES ssc."AcademicPrograms"("academicProgramId");


--
-- Name: EventAudienceRules EventAudienceRules_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT "EventAudienceRules_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventAudienceRules EventAudienceRules_eventId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT "EventAudienceRules_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES ssc."Events"("eventId");


--
-- Name: EventAudienceRules EventAudienceRules_studentId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT "EventAudienceRules_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES ssc."Students"("studentId");


--
-- Name: EventFinePolicies EventFinePolicies_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFinePolicies"
    ADD CONSTRAINT "EventFinePolicies_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventFinePolicies EventFinePolicies_eventId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFinePolicies"
    ADD CONSTRAINT "EventFinePolicies_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES ssc."Events"("eventId");


--
-- Name: EventFinePolicies EventFinePolicies_sourceFinePolicyTemplateVersionId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFinePolicies"
    ADD CONSTRAINT "EventFinePolicies_sourceFinePolicyTemplateVersionId_fkey" FOREIGN KEY ("sourceFinePolicyTemplateVersionId") REFERENCES ssc."FinePolicyTemplateVersions"("finePolicyTemplateVersionId");


--
-- Name: EventFineRuleOverrides EventFineRuleOverrides_eventFineRuleId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRuleOverrides"
    ADD CONSTRAINT "EventFineRuleOverrides_eventFineRuleId_fkey" FOREIGN KEY ("eventFineRuleId") REFERENCES ssc."EventFineRules"("eventFineRuleId");


--
-- Name: EventFineRuleOverrides EventFineRuleOverrides_overriddenByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRuleOverrides"
    ADD CONSTRAINT "EventFineRuleOverrides_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventFineRules EventFineRules_sourceFinePolicyTemplateRuleId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRules"
    ADD CONSTRAINT "EventFineRules_sourceFinePolicyTemplateRuleId_fkey" FOREIGN KEY ("sourceFinePolicyTemplateRuleId") REFERENCES ssc."FinePolicyTemplateRules"("finePolicyTemplateRuleId");


--
-- Name: EventParticipantQrCredentials EventParticipantQrCredentials_eventRegistrationId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipantQrCredentials"
    ADD CONSTRAINT "EventParticipantQrCredentials_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES ssc."EventRegistrations"("eventRegistrationId");


--
-- Name: EventParticipantQrCredentials EventParticipantQrCredentials_issuedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipantQrCredentials"
    ADD CONSTRAINT "EventParticipantQrCredentials_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventParticipantQrCredentials EventParticipantQrCredentials_revokedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipantQrCredentials"
    ADD CONSTRAINT "EventParticipantQrCredentials_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventRegistrations EventRegistrations_eventId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT "EventRegistrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES ssc."Events"("eventId");


--
-- Name: EventRegistrations EventRegistrations_registeredByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT "EventRegistrations_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventRegistrations EventRegistrations_sourceAudienceRuleId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT "EventRegistrations_sourceAudienceRuleId_fkey" FOREIGN KEY ("sourceAudienceRuleId") REFERENCES ssc."EventAudienceRules"("eventAudienceRuleId");


--
-- Name: EventSessionQrTokens EventSessionQrTokens_eventSessionId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessionQrTokens"
    ADD CONSTRAINT "EventSessionQrTokens_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES ssc."EventSessions"("eventSessionId") ON DELETE CASCADE;


--
-- Name: EventSessionQrTokens EventSessionQrTokens_issuedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessionQrTokens"
    ADD CONSTRAINT "EventSessionQrTokens_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventSessionQrTokens EventSessionQrTokens_revokedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessionQrTokens"
    ADD CONSTRAINT "EventSessionQrTokens_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FinePaymentAllocations FinePaymentAllocations_finePaymentId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePaymentAllocations"
    ADD CONSTRAINT "FinePaymentAllocations_finePaymentId_fkey" FOREIGN KEY ("finePaymentId") REFERENCES ssc."FinePayments"("finePaymentId");


--
-- Name: FinePaymentAllocations FinePaymentAllocations_studentFineAssessmentId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePaymentAllocations"
    ADD CONSTRAINT "FinePaymentAllocations_studentFineAssessmentId_fkey" FOREIGN KEY ("studentFineAssessmentId") REFERENCES ssc."StudentFineAssessments"("studentFineAssessmentId");


--
-- Name: FinePayments FinePayments_receivedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePayments"
    ADD CONSTRAINT "FinePayments_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FinePayments FinePayments_voidedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePayments"
    ADD CONSTRAINT "FinePayments_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FinePolicyTemplateRules FinePolicyTemplateRules_finePolicyTemplateVersionId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateRules"
    ADD CONSTRAINT "FinePolicyTemplateRules_finePolicyTemplateVersionId_fkey" FOREIGN KEY ("finePolicyTemplateVersionId") REFERENCES ssc."FinePolicyTemplateVersions"("finePolicyTemplateVersionId");


--
-- Name: FinePolicyTemplateVersions FinePolicyTemplateVersions_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateVersions"
    ADD CONSTRAINT "FinePolicyTemplateVersions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FinePolicyTemplateVersions FinePolicyTemplateVersions_finePolicyTemplateId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplateVersions"
    ADD CONSTRAINT "FinePolicyTemplateVersions_finePolicyTemplateId_fkey" FOREIGN KEY ("finePolicyTemplateId") REFERENCES ssc."FinePolicyTemplates"("finePolicyTemplateId");


--
-- Name: FinePolicyTemplates FinePolicyTemplates_createdByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FinePolicyTemplates"
    ADD CONSTRAINT "FinePolicyTemplates_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FineWaiverRequests FineWaiverRequests_requestedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FineWaiverRequests"
    ADD CONSTRAINT "FineWaiverRequests_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FineWaiverRequests FineWaiverRequests_reviewedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FineWaiverRequests"
    ADD CONSTRAINT "FineWaiverRequests_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: FineWaiverRequests FineWaiverRequests_studentFineAssessmentId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."FineWaiverRequests"
    ADD CONSTRAINT "FineWaiverRequests_studentFineAssessmentId_fkey" FOREIGN KEY ("studentFineAssessmentId") REFERENCES ssc."StudentFineAssessments"("studentFineAssessmentId");


--
-- Name: StudentFineAssessments StudentFineAssessments_assessedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineAssessments"
    ADD CONSTRAINT "StudentFineAssessments_assessedByUserId_fkey" FOREIGN KEY ("assessedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: StudentFineStatusHistory StudentFineStatusHistory_changedByUserId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineStatusHistory"
    ADD CONSTRAINT "StudentFineStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: StudentFineStatusHistory StudentFineStatusHistory_studentFineAssessmentId_fkey; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineStatusHistory"
    ADD CONSTRAINT "StudentFineStatusHistory_studentFineAssessmentId_fkey" FOREIGN KEY ("studentFineAssessmentId") REFERENCES ssc."StudentFineAssessments"("studentFineAssessmentId");


--
-- Name: AcademicTerms fk_academic_terms_year; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AcademicTerms"
    ADD CONSTRAINT fk_academic_terms_year FOREIGN KEY ("academicYearId") REFERENCES ssc."AcademicYears"("academicYearId");


--
-- Name: AttendanceCorrections fk_attendance_corrections_record; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceCorrections"
    ADD CONSTRAINT fk_attendance_corrections_record FOREIGN KEY ("attendanceRecordId") REFERENCES ssc."AttendanceRecords"("attendanceRecordId") ON DELETE CASCADE;


--
-- Name: AttendanceCorrections fk_attendance_corrections_requester; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceCorrections"
    ADD CONSTRAINT fk_attendance_corrections_requester FOREIGN KEY ("requestedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceCorrections fk_attendance_corrections_reviewer; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceCorrections"
    ADD CONSTRAINT fk_attendance_corrections_reviewer FOREIGN KEY ("reviewedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceLogs fk_attendance_logs_actor; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceLogs"
    ADD CONSTRAINT fk_attendance_logs_actor FOREIGN KEY ("actorUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceLogs fk_attendance_logs_correction; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceLogs"
    ADD CONSTRAINT fk_attendance_logs_correction FOREIGN KEY ("attendanceRecordId", "attendanceCorrectionId") REFERENCES ssc."AttendanceCorrections"("attendanceRecordId", "attendanceCorrectionId");


--
-- Name: AttendanceLogs fk_attendance_logs_record; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceLogs"
    ADD CONSTRAINT fk_attendance_logs_record FOREIGN KEY ("attendanceRecordId") REFERENCES ssc."AttendanceRecords"("attendanceRecordId") ON DELETE CASCADE;


--
-- Name: AttendanceRecords fk_attendance_records_actor; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceRecords"
    ADD CONSTRAINT fk_attendance_records_actor FOREIGN KEY ("lastChangedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: AttendanceRecords fk_attendance_records_participant; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."AttendanceRecords"
    ADD CONSTRAINT fk_attendance_records_participant FOREIGN KEY ("eventParticipantId") REFERENCES ssc."EventParticipants"("eventParticipantId") ON DELETE CASCADE;


--
-- Name: EventAnnouncements fk_event_announcements_event; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAnnouncements"
    ADD CONSTRAINT fk_event_announcements_event FOREIGN KEY ("eventId") REFERENCES ssc."Events"("eventId") ON DELETE CASCADE;


--
-- Name: EventAnnouncements fk_event_announcements_poster; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAnnouncements"
    ADD CONSTRAINT fk_event_announcements_poster FOREIGN KEY ("postedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventAudienceRules fk_event_audience_rules_event_term; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT fk_event_audience_rules_event_term FOREIGN KEY ("eventId", "academicTermId") REFERENCES ssc."Events"("eventId", "academicTermId");


--
-- Name: EventAudienceRules fk_event_audience_rules_section_context; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventAudienceRules"
    ADD CONSTRAINT fk_event_audience_rules_section_context FOREIGN KEY ("academicTermId", "academicProgramId", "yearLevel", "sectionId") REFERENCES ssc."Sections"("academicTermId", "academicProgramId", "yearLevel", "sectionId");


--
-- Name: EventFineRules fk_event_fine_rules_policy_event; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRules"
    ADD CONSTRAINT fk_event_fine_rules_policy_event FOREIGN KEY ("eventFinePolicyId", "eventId") REFERENCES ssc."EventFinePolicies"("eventFinePolicyId", "eventId");


--
-- Name: EventFineRules fk_event_fine_rules_session_event; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventFineRules"
    ADD CONSTRAINT fk_event_fine_rules_session_event FOREIGN KEY ("eventSessionId", "eventId") REFERENCES ssc."EventSessions"("eventSessionId", "eventId");


--
-- Name: EventParticipants fk_event_participants_actor; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT fk_event_participants_actor FOREIGN KEY ("addedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: EventParticipants fk_event_participants_enrollment; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT fk_event_participants_enrollment FOREIGN KEY ("academicTermId", "studentEnrollmentId", "studentId") REFERENCES ssc."StudentEnrollments"("academicTermId", "studentEnrollmentId", "studentId") ON DELETE CASCADE;


--
-- Name: EventParticipants fk_event_participants_registration; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT fk_event_participants_registration FOREIGN KEY ("eventRegistrationId") REFERENCES ssc."EventRegistrations"("eventRegistrationId");


--
-- Name: EventParticipants fk_event_participants_session; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventParticipants"
    ADD CONSTRAINT fk_event_participants_session FOREIGN KEY ("eventSessionId", "academicTermId") REFERENCES ssc."EventSessions"("eventSessionId", "academicTermId") ON DELETE CASCADE;


--
-- Name: EventRegistrations fk_event_registrations_enrollment_student; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT fk_event_registrations_enrollment_student FOREIGN KEY ("studentEnrollmentId", "studentId") REFERENCES ssc."StudentEnrollments"("studentEnrollmentId", "studentId");


--
-- Name: EventSessions fk_event_sessions_event; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventSessions"
    ADD CONSTRAINT fk_event_sessions_event FOREIGN KEY ("eventId", "academicTermId") REFERENCES ssc."Events"("eventId", "academicTermId") ON DELETE CASCADE;


--
-- Name: Events fk_events_creator; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Events"
    ADD CONSTRAINT fk_events_creator FOREIGN KEY ("createdByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: Events fk_events_term; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Events"
    ADD CONSTRAINT fk_events_term FOREIGN KEY ("academicTermId") REFERENCES ssc."AcademicTerms"("academicTermId");


--
-- Name: ExternalLogins fk_external_logins_provider; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."ExternalLogins"
    ADD CONSTRAINT fk_external_logins_provider FOREIGN KEY ("authProviderId") REFERENCES ssc."AuthProviders"("authProviderId");


--
-- Name: ExternalLogins fk_external_logins_user; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."ExternalLogins"
    ADD CONSTRAINT fk_external_logins_user FOREIGN KEY ("userId") REFERENCES ssc."Users"("userId") ON DELETE CASCADE;


--
-- Name: Sections fk_sections_program; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Sections"
    ADD CONSTRAINT fk_sections_program FOREIGN KEY ("academicProgramId") REFERENCES ssc."AcademicPrograms"("academicProgramId");


--
-- Name: Sections fk_sections_term; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Sections"
    ADD CONSTRAINT fk_sections_term FOREIGN KEY ("academicTermId") REFERENCES ssc."AcademicTerms"("academicTermId");


--
-- Name: StudentEnrollments fk_student_enrollments_program; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT fk_student_enrollments_program FOREIGN KEY ("academicProgramId") REFERENCES ssc."AcademicPrograms"("academicProgramId");


--
-- Name: StudentEnrollments fk_student_enrollments_section; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT fk_student_enrollments_section FOREIGN KEY ("academicTermId", "academicProgramId", "yearLevel", "sectionId") REFERENCES ssc."Sections"("academicTermId", "academicProgramId", "yearLevel", "sectionId");


--
-- Name: StudentEnrollments fk_student_enrollments_student; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT fk_student_enrollments_student FOREIGN KEY ("studentId") REFERENCES ssc."Students"("studentId") ON DELETE CASCADE;


--
-- Name: StudentEnrollments fk_student_enrollments_term; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentEnrollments"
    ADD CONSTRAINT fk_student_enrollments_term FOREIGN KEY ("academicTermId") REFERENCES ssc."AcademicTerms"("academicTermId");


--
-- Name: StudentFineAssessments fk_student_fine_assessments_participant_session; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentFineAssessments"
    ADD CONSTRAINT fk_student_fine_assessments_participant_session FOREIGN KEY ("eventParticipantId", "eventSessionId") REFERENCES ssc."EventParticipants"("eventParticipantId", "eventSessionId");


--
-- Name: StudentUserLinks fk_student_user_links_linked_by; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentUserLinks"
    ADD CONSTRAINT fk_student_user_links_linked_by FOREIGN KEY ("linkedByUserId") REFERENCES ssc."Users"("userId") ON DELETE RESTRICT;


--
-- Name: StudentUserLinks fk_student_user_links_student; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentUserLinks"
    ADD CONSTRAINT fk_student_user_links_student FOREIGN KEY ("studentId") REFERENCES ssc."Students"("studentId") ON DELETE RESTRICT;


--
-- Name: StudentUserLinks fk_student_user_links_user; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."StudentUserLinks"
    ADD CONSTRAINT fk_student_user_links_user FOREIGN KEY ("userId") REFERENCES ssc."Users"("userId") ON DELETE RESTRICT;


--
-- Name: Students fk_students_user; Type: FK CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."Students"
    ADD CONSTRAINT fk_students_user FOREIGN KEY ("userId") REFERENCES ssc."Users"("userId");


--
-- Name: EventRegistrations uq_registration_contribution_context; Type: CONSTRAINT; Schema: ssc; Owner: -
--

ALTER TABLE ONLY ssc."EventRegistrations"
    ADD CONSTRAINT uq_registration_contribution_context UNIQUE ("eventRegistrationId", "eventId");


--
-- Name: EventContributionTypes; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."EventContributionTypes" (
    "contributionTypeId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    name character varying(200) NOT NULL,
    "defaultAmount" numeric(12,2) NOT NULL,
    "dueDate" date,
    "isRequired" boolean DEFAULT true NOT NULL,
    "createdByUserId" integer NOT NULL,
    "createdAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_event_contribution_types_amount CHECK (("defaultAmount" > (0)::numeric)),
    CONSTRAINT ck_event_contribution_types_name CHECK ((length(btrim((name)::text)) > 0))
);

ALTER TABLE ssc."EventContributionTypes" ALTER COLUMN "contributionTypeId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."EventContributionTypes_contributionTypeId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY ssc."EventContributionTypes"
    ADD CONSTRAINT "EventContributionTypes_pkey" PRIMARY KEY ("contributionTypeId");

ALTER TABLE ONLY ssc."EventContributionTypes"
    ADD CONSTRAINT uq_event_contribution_types_event_name UNIQUE ("eventId", name);

ALTER TABLE ONLY ssc."EventContributionTypes"
    ADD CONSTRAINT uq_event_contribution_types_id_event UNIQUE ("contributionTypeId", "eventId");

ALTER TABLE ONLY ssc."EventContributionTypes"
    ADD CONSTRAINT fk_event_contribution_types_creator FOREIGN KEY ("createdByUserId") REFERENCES ssc."Users"("userId");

ALTER TABLE ONLY ssc."EventContributionTypes"
    ADD CONSTRAINT fk_event_contribution_types_event FOREIGN KEY ("eventId") REFERENCES ssc."Events"("eventId") ON DELETE CASCADE;


--
-- Name: StudentContributions; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."StudentContributions" (
    "studentContributionId" bigint NOT NULL,
    "eventId" bigint NOT NULL,
    "eventRegistrationId" bigint NOT NULL,
    "contributionTypeId" bigint NOT NULL,
    "amountDue" numeric(12,2) NOT NULL,
    "waiverAmount" numeric(12,2) DEFAULT 0 NOT NULL,
    "waiverReason" character varying(1000),
    "waivedByUserId" integer,
    "waivedAtUtc" timestamp with time zone,
    "assignedByUserId" integer NOT NULL,
    "assignedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT ck_student_contributions_amount CHECK (("amountDue" > (0)::numeric)),
    CONSTRAINT ck_student_contributions_waiver CHECK ((("waiverAmount" >= (0)::numeric) AND ("waiverAmount" <= "amountDue"))),
    CONSTRAINT ck_student_contributions_waiver_audit CHECK ((("waiverAmount" = (0)::numeric) OR (("waiverReason" IS NOT NULL) AND (length(btrim(("waiverReason")::text)) > 0) AND ("waivedByUserId" IS NOT NULL) AND ("waivedAtUtc" IS NOT NULL))))
);

ALTER TABLE ssc."StudentContributions" ALTER COLUMN "studentContributionId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."StudentContributions_studentContributionId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY ssc."StudentContributions"
    ADD CONSTRAINT "StudentContributions_pkey" PRIMARY KEY ("studentContributionId");

ALTER TABLE ONLY ssc."StudentContributions"
    ADD CONSTRAINT uq_student_contributions_reg_type UNIQUE ("eventRegistrationId", "contributionTypeId");

CREATE INDEX ix_student_contributions_event ON ssc."StudentContributions" USING btree ("eventId");

ALTER TABLE ONLY ssc."StudentContributions"
    ADD CONSTRAINT fk_student_contributions_assigner FOREIGN KEY ("assignedByUserId") REFERENCES ssc."Users"("userId");

ALTER TABLE ONLY ssc."StudentContributions"
    ADD CONSTRAINT fk_student_contributions_registration FOREIGN KEY ("eventRegistrationId", "eventId") REFERENCES ssc."EventRegistrations"("eventRegistrationId", "eventId") ON DELETE CASCADE;

ALTER TABLE ONLY ssc."StudentContributions"
    ADD CONSTRAINT fk_student_contributions_type FOREIGN KEY ("contributionTypeId", "eventId") REFERENCES ssc."EventContributionTypes"("contributionTypeId", "eventId") ON DELETE CASCADE;

ALTER TABLE ONLY ssc."StudentContributions"
    ADD CONSTRAINT fk_student_contributions_waiver_user FOREIGN KEY ("waivedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: ContributionPayments; Type: TABLE; Schema: ssc; Owner: -
--

CREATE TABLE ssc."ContributionPayments" (
    "contributionPaymentId" bigint NOT NULL,
    "studentContributionId" bigint NOT NULL,
    amount numeric(12,2) NOT NULL,
    "paymentMethodCode" character varying(30) NOT NULL,
    "paymentReference" character varying(100) NOT NULL,
    "externalPaymentReference" character varying(100),
    "paymentStatusCode" character varying(20) DEFAULT 'CONFIRMED'::character varying NOT NULL,
    "receivedByUserId" integer NOT NULL,
    "receivedAtUtc" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    "voidedByUserId" integer,
    "voidedAtUtc" timestamp with time zone,
    "voidReason" character varying(1000),
    CONSTRAINT ck_contribution_payments_amount CHECK ((amount > (0)::numeric)),
    CONSTRAINT ck_contribution_payments_method CHECK ((("paymentMethodCode")::text = ANY ((ARRAY['CASH'::character varying, 'GCASH'::character varying, 'BANK_TRANSFER'::character varying, 'OTHER'::character varying])::text[]))),
    CONSTRAINT ck_contribution_payments_reference CHECK ((length(btrim(("paymentReference")::text)) > 0)),
    CONSTRAINT ck_contribution_payments_status CHECK ((("paymentStatusCode")::text = ANY ((ARRAY['CONFIRMED'::character varying, 'VOIDED'::character varying])::text[]))),
    CONSTRAINT ck_contribution_payments_void_audit CHECK (((("paymentStatusCode")::text <> 'VOIDED'::text) OR (("voidedByUserId" IS NOT NULL) AND ("voidedAtUtc" IS NOT NULL) AND ("voidReason" IS NOT NULL) AND (length(btrim(("voidReason")::text)) > 0))))
);

ALTER TABLE ssc."ContributionPayments" ALTER COLUMN "contributionPaymentId" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME ssc."ContributionPayments_contributionPaymentId_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY ssc."ContributionPayments"
    ADD CONSTRAINT "ContributionPayments_pkey" PRIMARY KEY ("contributionPaymentId");

ALTER TABLE ONLY ssc."ContributionPayments"
    ADD CONSTRAINT uq_contribution_payments_reference UNIQUE ("paymentReference");

CREATE INDEX ix_contribution_payments_student ON ssc."ContributionPayments" USING btree ("studentContributionId");

CREATE UNIQUE INDEX ux_contribution_payments_external_reference ON ssc."ContributionPayments" USING btree ("paymentMethodCode", "externalPaymentReference") WHERE ("externalPaymentReference" IS NOT NULL);

ALTER TABLE ONLY ssc."ContributionPayments"
    ADD CONSTRAINT fk_contribution_payments_contribution FOREIGN KEY ("studentContributionId") REFERENCES ssc."StudentContributions"("studentContributionId") ON DELETE CASCADE;

ALTER TABLE ONLY ssc."ContributionPayments"
    ADD CONSTRAINT fk_contribution_payments_receiver FOREIGN KEY ("receivedByUserId") REFERENCES ssc."Users"("userId");

ALTER TABLE ONLY ssc."ContributionPayments"
    ADD CONSTRAINT fk_contribution_payments_voider FOREIGN KEY ("voidedByUserId") REFERENCES ssc."Users"("userId");


--
-- Name: VwStudentContributionBalances; Type: VIEW; Schema: ssc; Owner: -
--

CREATE VIEW ssc."VwStudentContributionBalances" AS
 SELECT sc."studentContributionId",
    sc."eventId",
    sc."eventRegistrationId",
    sc."contributionTypeId",
    sc."amountDue",
    sc."waiverAmount",
    sc."waiverReason",
    sc."waivedByUserId",
    sc."waivedAtUtc",
    sc."assignedByUserId",
    sc."assignedAtUtc",
    (COALESCE(p.paid, (0)::numeric))::numeric(12,2) AS "paidAmount",
    ((sc."amountDue" - sc."waiverAmount") - COALESCE(p.paid, (0)::numeric))::numeric(12,2) AS "outstandingAmount",
        CASE
            WHEN (sc."waiverAmount" = sc."amountDue") THEN 'WAIVED'::text
            WHEN ((sc."amountDue" - sc."waiverAmount") = COALESCE(p.paid, (0)::numeric)) THEN 'PAID'::text
            WHEN (COALESCE(p.paid, (0)::numeric) > (0)::numeric) THEN 'PARTIALLY_PAID'::text
            ELSE 'UNPAID'::text
        END AS status
   FROM (ssc."StudentContributions" sc
     LEFT JOIN LATERAL ( SELECT sum(cp.amount) AS paid
           FROM ssc."ContributionPayments" cp
          WHERE ((cp."studentContributionId" = sc."studentContributionId") AND ((cp."paymentStatusCode")::text = 'CONFIRMED'::text))) p ON (true));


--
-- PostgreSQL database dump complete
--

\unrestrict 3x30pQnW3bWwueZQmud9eXsmP70ksYBWlJ37VbdBykjJ0r25r3bs9DhnlwGpRKh


