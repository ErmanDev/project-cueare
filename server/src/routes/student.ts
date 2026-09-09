import { Router, type Request } from 'express';

import { AttendanceService } from '../attendance/service.ts';
import * as q from '../db/queries.ts';
import { getPool } from '../db/pool.ts';
import { SCAN_STATUS } from '../types.ts';
import { notFound } from '../utils/errors.ts';
import { queryInt } from '../utils/http.ts';
import { requireValidStudentCode } from '../utils/studentCode.ts';
import { attendanceDetailToApi, studentToApi } from '../utils/serialize.ts';
import { asyncHandler } from './auth.ts';

function service(req: Request): AttendanceService {
  return req.app.locals.attendance as AttendanceService;
}

export const studentRouter = Router();

studentRouter.get(
  '/:code/qr',
  asyncHandler(async (req, res) => {
    const safeCode = requireValidStudentCode(req.params.code);
    const student = await service(req).catalog.getStudentByCode(safeCode);
    if (!student) throw notFound(`No student found for code "${safeCode}"`);
    res.json({
      student: studentToApi(student),
      qr_payload: service(req).qrPayloadFor(student),
    });
  }),
);

studentRouter.get(
  '/:code/attendance',
  asyncHandler(async (req, res) => {
    const safeCode = requireValidStudentCode(req.params.code);
    const student = await service(req).catalog.getStudentByCode(safeCode);
    if (!student) throw notFound(`No student found for code "${safeCode}"`);
    const rows = await q.listAttendance(getPool(), {
      studentId: student.id,
      eventId: queryInt(req, 'event_id'),
      status: SCAN_STATUS.confirmed,
      limit: queryInt(req, 'limit') ?? 500,
    });
    res.json({
      student: studentToApi(student),
      attendance: rows.map(attendanceDetailToApi),
    });
  }),
);
