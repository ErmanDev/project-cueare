const error = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string' },
    code: { type: 'string', description: 'Machine-readable code when present' },
  },
  additionalProperties: true,
};

const bearer = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SSC QR Attendance API',
    version: '1.0.0',
    description:
      'REST API for QR event attendance, published through IIS. ' +
      'Authorize with a JWT from `POST /auth/login`. ' +
      '`/admin/*` is superadmin-only; `/moderator/*` is moderator-only; `/student/*` is public. ' +
      'Login and scan routes are rate-limited in-process (429 + Retry-After).',
  },
  servers: [
    { url: '/api', description: 'REST API' },
    { url: '/', description: 'Unprefixed aliases (same routes)' },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Auth' },
    { name: 'Admin — Students' },
    { name: 'Admin — Events' },
    { name: 'Admin — Composite Events' },
    { name: 'Admin — Fine Policies' },
    { name: 'Admin — Fine Settlements' },
    { name: 'Admin — Moderators' },
    { name: 'Admin — Attendance' },
    { name: 'Moderator' },
    { name: 'Student' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the token from POST /auth/login',
      },
    },
    schemas: {
      Error: error,
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          username: { type: 'string' },
          role: { type: 'string', enum: ['superadmin', 'moderator', 'student'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          student_id: {
            type: 'integer',
            nullable: true,
            description: 'Set when this moderator was promoted from a student',
          },
        },
      },
      Student: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          student_id_code: { type: 'string', example: '02-26-0011' },
          first_name: { type: 'string', nullable: true },
          middle_name: { type: 'string', nullable: true },
          last_name: { type: 'string', nullable: true },
          full_name: { type: 'string' },
          course: { type: 'string', nullable: true, example: 'BSIT' },
          year_level: { type: 'integer', nullable: true, example: 1 },
          section: { type: 'string', nullable: true },
          photo_url: { type: 'string', nullable: true },
          user_id: {
            type: 'integer',
            nullable: true,
            description: 'Linked staff user when this student is also a moderator',
          },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          qr_payload: { type: 'string', description: 'Value encoded in the student QR' },
        },
      },
      StudentPage: {
        type: 'object',
        required: ['students', 'total', 'page', 'per_page'],
        properties: {
          students: { type: 'array', items: { $ref: '#/components/schemas/Student' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          per_page: { type: 'integer' },
        },
      },
      SessionWindow: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          event_id: { type: 'integer' },
          session_label: { type: 'string', example: 'Morning' },
          start_time: { type: 'string', example: '07:00' },
          end_time: { type: 'string', example: '12:00' },
          sort_order: { type: 'integer' },
        },
      },
      Event: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          event_date: { type: 'string', format: 'date-time' },
          is_active: { type: 'boolean' },
          is_expired: { type: 'boolean' },
          created_by: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          session_windows: {
            type: 'array',
            items: { $ref: '#/components/schemas/SessionWindow' },
          },
        },
      },
      AttendanceLog: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          event_id: { type: 'integer' },
          student_id: { type: 'integer' },
          session_window_id: { type: 'integer' },
          direction: { type: 'string', enum: ['IN', 'OUT'] },
          scanned_at: { type: 'string', format: 'date-time' },
          scanned_by: { type: 'integer' },
          status: { type: 'string', enum: ['confirmed', 'cancelled'] },
          device_note: { type: 'string', nullable: true },
          updated_at: { type: 'string', format: 'date-time' },
          student_id_code: { type: 'string', nullable: true },
          first_name: { type: 'string', nullable: true },
          middle_name: { type: 'string', nullable: true },
          last_name: { type: 'string', nullable: true },
          student_name: { type: 'string', nullable: true },
          course: { type: 'string', nullable: true },
          year_level: { type: 'integer', nullable: true },
          student_section: { type: 'string', nullable: true },
          session_label: { type: 'string', nullable: true },
          scanned_by_name: { type: 'string', nullable: true },
          event_name: { type: 'string', nullable: true },
        },
      },
      ScanPreview: {
        type: 'object',
        properties: {
          student: { $ref: '#/components/schemas/Student' },
          event: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
            },
          },
          computed_session: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              session_label: { type: 'string' },
              start_time: { type: 'string' },
              end_time: { type: 'string' },
              mode: { type: 'string', enum: ['auto', 'manual'] },
            },
          },
          computed_direction: {
            type: 'string',
            enum: ['IN', 'OUT', 'ALREADY_COMPLETE'],
          },
          is_late: { type: 'boolean' },
          can_confirm: { type: 'boolean' },
          server_time: { type: 'string', format: 'date-time' },
          existing_scans: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                direction: { type: 'string' },
                scanned_at: { type: 'string', format: 'date-time' },
              },
            },
          },
          message: { type: 'string' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: {
            type: 'string',
            example: 'admin',
            description: 'Staff username or student ID',
          },
          password: {
            type: 'string',
            example: 'changeme123',
            description:
              'Staff password, or the student ID for student login',
          },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          role: { type: 'string', enum: ['superadmin', 'moderator', 'student'] },
          user: { $ref: '#/components/schemas/User' },
          student: { $ref: '#/components/schemas/Student' },
          expires_in_hours: { type: 'integer', example: 12 },
        },
      },
    },
  },
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Reachability check',
        responses: {
          '200': {
            description: 'API is up',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    status: { type: 'string', example: 'ok' },
                    server_time: { type: 'string', format: 'date-time' },
                    database: { type: 'string' },
                    docs: { type: 'string', example: '/docs' },
                    api: { type: 'string', example: '/api' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    server_time: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'JWT issued',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          '401': {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'RATE_LIMITED — too many login attempts',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change the signed-in student password',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['current_password', 'new_password'],
                properties: {
                  current_password: { type: 'string' },
                  new_password: { type: 'string', minLength: 4 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password updated' },
          '400': {
            description: 'Current password is wrong, or new password is too short',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Current user',
        security: bearer,
        responses: {
          '200': {
            description: 'Authenticated user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    user: { $ref: '#/components/schemas/User' },
                    role: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': {
            description: 'Missing or invalid token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/students': {
      get: {
        tags: ['Admin — Students'],
        summary: 'List students',
        security: bearer,
        parameters: [
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string' },
            description: 'Search name, code, or section',
          },
          {
            name: 'page',
            in: 'query',
            schema: { type: 'integer', minimum: 1 },
            description: '1-based page. When set with per_page, returns a StudentPage object.',
          },
          {
            name: 'per_page',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
            description: 'Page size. Omit page and per_page to receive the full array (mobile clients).',
          },
        ],
        responses: {
          '200': {
            description:
              'Full student array when unpaginated; { students, total, page, per_page } when page or per_page is set',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { type: 'array', items: { $ref: '#/components/schemas/Student' } },
                    { $ref: '#/components/schemas/StudentPage' },
                  ],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin — Students'],
        summary: 'Create student',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['student_id_code', 'full_name'],
                properties: {
                  student_id_code: { type: 'string' },
                  full_name: { type: 'string' },
                  section: { type: 'string' },
                  photo_url: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Student' } },
            },
          },
          '409': {
            description: 'Code already exists',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/students/import': {
      post: {
        tags: ['Admin — Students'],
        summary: 'Bulk import students',
        description:
          'Accepts the school roster headers from `sample_data.xls` ' +
          '(`StudentID`, `FName`, `LName`, `MName`, `COURSE`, `YrLevel`, `Sectioning`, plus unused extra columns). ' +
          'JSON `{csv}` / `{spreadsheet}` / `{students}`, raw `text/csv`, or an Excel body. ' +
          'Existing codes are upserted unless `mode=skip`.',
        security: bearer,
        parameters: [
          {
            name: 'mode',
            in: 'query',
            schema: { type: 'string', enum: ['skip'] },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  csv: {
                    type: 'string',
                    description:
                      'CSV or tab-separated roster. Preferred headers: StudentID, FName, LName, MName, COURSE, YrLevel, Sectioning',
                  },
                  spreadsheet: {
                    type: 'string',
                    description: 'Base64-encoded .xls or .xlsx workbook',
                  },
                  students: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        StudentID: { type: 'string' },
                        FName: { type: 'string' },
                        LName: { type: 'string' },
                        MName: { type: 'string' },
                        COURSE: { type: 'string' },
                        YrLevel: { type: 'string' },
                        Sectioning: { type: 'string' },
                        student_id_code: { type: 'string' },
                        full_name: { type: 'string' },
                        section: { type: 'string' },
                        photo_url: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            'text/csv': { schema: { type: 'string' } },
            'application/vnd.ms-excel': { schema: { type: 'string', format: 'binary' } },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
              schema: { type: 'string', format: 'binary' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Import summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    created: { type: 'integer' },
                    updated: { type: 'integer' },
                    skipped: { type: 'integer' },
                    errors: { type: 'array', items: { type: 'object' } },
                    total_rows: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/students/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Students'],
        summary: 'Get student',
        security: bearer,
        responses: {
          '200': {
            description: 'Student',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Student' } },
            },
          },
          '404': {
            description: 'Not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      put: {
        tags: ['Admin — Students'],
        summary: 'Update student',
        security: bearer,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  student_id_code: { type: 'string' },
                  full_name: { type: 'string' },
                  section: { type: 'string', nullable: true },
                  photo_url: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Student' } },
            },
          },
        },
      },
      delete: {
        tags: ['Admin — Students'],
        summary: 'Delete student',
        security: bearer,
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/admin/events': {
      get: {
        tags: ['Admin — Events'],
        summary: 'List events',
        security: bearer,
        responses: {
          '200': {
            description: 'Events with session windows',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Event' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin — Events'],
        summary: 'Create event',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'event_date'],
                properties: {
                  name: { type: 'string' },
                  event_date: { type: 'string', format: 'date-time' },
                  is_active: { type: 'boolean', default: true },
                  session_windows: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['session_label', 'start_time', 'end_time'],
                      properties: {
                        session_label: { type: 'string' },
                        start_time: { type: 'string', example: '07:00' },
                        end_time: { type: 'string', example: '12:00' },
                        sort_order: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Event' } } },
          },
          '400': {
            description: 'Past event date',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/events/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Events'],
        summary: 'Get event',
        security: bearer,
        responses: {
          '200': {
            description: 'Event',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Event' } } },
          },
        },
      },
      put: {
        tags: ['Admin — Events'],
        summary: 'Update event',
        security: bearer,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  event_date: { type: 'string', format: 'date-time' },
                  is_active: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Event' } } },
          },
        },
      },
      delete: {
        tags: ['Admin — Events'],
        summary: 'Delete event',
        security: bearer,
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/admin/events/{id}/session-windows': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Events'],
        summary: 'List session windows',
        security: bearer,
        responses: {
          '200': {
            description: 'Windows',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/SessionWindow' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin — Events'],
        summary: 'Add session window',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['session_label', 'start_time', 'end_time'],
                properties: {
                  session_label: { type: 'string' },
                  start_time: { type: 'string' },
                  end_time: { type: 'string' },
                  sort_order: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SessionWindow' } },
            },
          },
          '409': {
            description: 'WINDOW_OVERLAP',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/session-windows/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Events'],
        summary: 'Get session window',
        security: bearer,
        responses: {
          '200': {
            description: 'Window',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SessionWindow' } },
            },
          },
        },
      },
      put: {
        tags: ['Admin — Events'],
        summary: 'Update session window',
        security: bearer,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  session_label: { type: 'string' },
                  start_time: { type: 'string' },
                  end_time: { type: 'string' },
                  sort_order: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/SessionWindow' } },
            },
          },
        },
      },
      delete: {
        tags: ['Admin — Events'],
        summary: 'Delete session window',
        description: 'Pass `force=true` if the session has attendance records.',
        security: bearer,
        parameters: [
          { name: 'force', in: 'query', schema: { type: 'string', enum: ['true'] } },
        ],
        responses: {
          '204': { description: 'Deleted' },
          '409': {
            description: 'HAS_RECORDS',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/fine-templates': {
      get: {
        tags: ['Admin — Fine Policies'],
        summary: 'List fine policy templates (Public / Anonymous)',
        description: 'Fetch reusable fine policy templates and published version rules (Public / Anonymous)',
        responses: {
          '200': {
            description: 'List of fine policy templates',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      template_id: { type: 'integer' },
                      template_code: { type: 'string' },
                      template_name: { type: 'string' },
                      description: { type: 'string', nullable: true },
                      is_active: { type: 'boolean' },
                      active_version: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          version_id: { type: 'integer' },
                          version_number: { type: 'integer' },
                          currency_code: { type: 'string' },
                          max_fine_per_student: { type: 'number', nullable: true },
                          rules: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                rule_id: { type: 'integer' },
                                session_type_code: { type: 'string' },
                                violation_code: { type: 'string' },
                                fine_amount: { type: 'number' },
                                priority_order: { type: 'integer' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/events/{id}/fine-policy': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Fine Policies'],
        summary: 'Get event fine policy & rules matrix',
        description: 'Retrieve fine policy, session rule matrix, and active overrides for an event',
        security: bearer,
        responses: {
          '200': {
            description: 'Event fine policy with session rule matrix',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    event_id: { type: 'integer' },
                    fine_policy: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        policy_id: { type: 'integer' },
                        policy_code: { type: 'string' },
                        policy_name: { type: 'string' },
                        currency_code: { type: 'string' },
                        maximum_fine_per_student: { type: 'number', nullable: true },
                        status: { type: 'string' },
                      },
                    },
                    sessions: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          session_id: { type: 'integer' },
                          session_code: { type: 'string' },
                          session_name: { type: 'string' },
                          session_type_code: { type: 'string' },
                          rules: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                rule_id: { type: 'integer' },
                                violation_code: { type: 'string' },
                                base_fine_amount: { type: 'number' },
                                effective_fine_amount: { type: 'number' },
                                priority_order: { type: 'integer' },
                                override: {
                                  type: 'object',
                                  nullable: true,
                                  properties: {
                                    override_id: { type: 'integer' },
                                    fine_amount: { type: 'number' },
                                    override_reason: { type: 'string' },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/events/{id}/fine-policy/from-template': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: {
        tags: ['Admin — Fine Policies'],
        summary: 'Apply fine policy template to event',
        description: 'Instantiate event fine policy and session rules from a published template version',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['template_version_id'],
                properties: {
                  template_version_id: { type: 'integer' },
                  policy_code: { type: 'string' },
                  policy_name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Fine policy applied',
          },
          '400': {
            description: 'Invalid input',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/events/{id}/fine-policy/rules': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      put: {
        tags: ['Admin — Fine Policies'],
        summary: 'Atomic batch upsert event fine rules & overrides',
        description: 'Update or insert session fine rules and rule overrides in a single transaction',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rules'],
                properties: {
                  policy_code: { type: 'string' },
                  policy_name: { type: 'string' },
                  rules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['session_id', 'violation_code', 'fine_amount'],
                      properties: {
                        session_id: { type: 'integer' },
                        violation_code: { type: 'string', example: 'ABSENT' },
                        fine_amount: { type: 'number', example: 100.00 },
                        priority_order: { type: 'integer', default: 100 },
                        override: {
                          type: 'object',
                          nullable: true,
                          properties: {
                            fine_amount: { type: 'number' },
                            override_reason: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated event fine policy & matrix',
          },
          '400': {
            description: 'Invalid input',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/events/composite': {
      post: {
        tags: ['Admin — Composite Events'],
        summary: 'Create composite event with sessions, audience rules, and fine policy',
        description: 'Atomic creation of an entire event, its sessions, audience criteria, and fine policy rules in one transaction.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event_code', 'event_name'],
                properties: {
                  event_code: { type: 'string', example: 'EVT-ACQUAINTANCE-2026' },
                  event_name: { type: 'string', example: 'Acquaintance Party 2026' },
                  academic_term_id: { type: 'integer' },
                  event_date: { type: 'string', format: 'date' },
                  sessions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['session_code', 'session_name', 'starts_at_utc', 'ends_at_utc', 'check_in_opens_at_utc', 'check_in_closes_at_utc', 'late_after_utc'],
                      properties: {
                        session_code: { type: 'string', example: 'SESS-AM' },
                        session_name: { type: 'string', example: 'Morning Plenary' },
                        session_type_code: { type: 'string', example: 'AM' },
                        starts_at_utc: { type: 'string', format: 'date-time' },
                        ends_at_utc: { type: 'string', format: 'date-time' },
                        check_in_opens_at_utc: { type: 'string', format: 'date-time' },
                        check_in_closes_at_utc: { type: 'string', format: 'date-time' },
                        late_after_utc: { type: 'string', format: 'date-time' },
                        check_out_opens_at_utc: { type: 'string', format: 'date-time', nullable: true },
                        check_out_closes_at_utc: { type: 'string', format: 'date-time', nullable: true },
                        requires_check_out: { type: 'boolean', default: false },
                        minimum_minutes: { type: 'integer', default: 0 },
                      },
                    },
                  },
                  audience_rules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['audience_scope_code'],
                      properties: {
                        audience_scope_code: { type: 'string', enum: ['ALL_STUDENTS', 'PROGRAM', 'YEAR_LEVEL', 'SECTION', 'STUDENT'] },
                        academic_program_id: { type: 'integer', nullable: true },
                        section_id: { type: 'integer', nullable: true },
                        year_level: { type: 'integer', nullable: true },
                        student_id: { type: 'integer', nullable: true },
                        is_required: { type: 'boolean', default: true },
                      },
                    },
                  },
                  fine_policy: {
                    type: 'object',
                    properties: {
                      template_version_id: { type: 'integer', nullable: true },
                      policy_code: { type: 'string' },
                      policy_name: { type: 'string' },
                      maximum_fine_per_student: { type: 'number' },
                      custom_rules: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['session_code', 'violation_code', 'fine_amount'],
                          properties: {
                            session_code: { type: 'string' },
                            violation_code: { type: 'string' },
                            fine_amount: { type: 'number' },
                            priority_order: { type: 'integer' },
                            override: {
                              type: 'object',
                              nullable: true,
                              properties: {
                                fine_amount: { type: 'number' },
                                override_reason: { type: 'string' },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Composite event created' },
          '400': { description: 'Invalid input' },
        },
      },
    },
    '/admin/events/{id}/composite': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      put: {
        tags: ['Admin — Composite Events'],
        summary: 'Update composite event with sessions, audience rules, and fine policy',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event_code', 'event_name'],
                properties: {
                  event_code: { type: 'string' },
                  event_name: { type: 'string' },
                  academic_term_id: { type: 'integer' },
                  event_date: { type: 'string', format: 'date' },
                  sessions: { type: 'array' },
                  audience_rules: { type: 'array' },
                  fine_policy: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Composite event updated' },
        },
      },
    },
    '/admin/events/{id}/publish': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: {
        tags: ['Admin — Composite Events'],
        summary: 'Publish event & generate participant roster',
        description: 'Runs `sp_event_roster_generate_from_audience_rules` and sets eventStatusCode to PUBLISHED.',
        security: bearer,
        responses: {
          '200': { description: 'Event published' },
        },
      },
    },
    '/admin/events/{id}/sessions/{sessionId}/assess-fines': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'sessionId', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      post: {
        tags: ['Admin — Fine Settlements'],
        summary: 'Close session & execute fine assessment',
        description: 'Closes session and executes stored procedure `sp_student_fine_assess_closed_session`.',
        security: bearer,
        responses: {
          '200': { description: 'Fines assessed' },
        },
      },
    },
    '/admin/fine-templates/upsert': {
      post: {
        tags: ['Admin — Fine Policies'],
        summary: 'Upsert fine policy template & rule matrix',
        description: 'Create or update reusable fine policy template, version, and violation rates.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['template_code', 'template_name', 'rules'],
                properties: {
                  template_code: { type: 'string', example: 'STANDARD_SCHOOL_EVENT' },
                  template_name: { type: 'string', example: 'Standard School Event Policy' },
                  description: { type: 'string' },
                  version_number: { type: 'integer', default: 1 },
                  currency_code: { type: 'string', default: 'PHP' },
                  maximum_fine_per_student: { type: 'number', default: 500.00 },
                  publish: { type: 'boolean', default: true },
                  rules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['session_type_code', 'violation_code', 'fine_amount'],
                      properties: {
                        session_type_code: { type: 'string', example: 'AM' },
                        violation_code: { type: 'string', example: 'ABSENT' },
                        fine_amount: { type: 'number', example: 100.00 },
                        priority_order: { type: 'integer', default: 100 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Fine template saved' },
        },
      },
    },
    '/admin/events/{id}/close': {
      post: {
        tags: ['Admin — Events'],
        summary: 'Close event and assess remaining session fines',
        description: 'Closes ended sessions, posts fines under active event policy, then closes event and policy. Event closure is idempotent.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Event closed with fine totals' }, '409': { description: 'Event or sessions cannot be closed yet' } },
      },
    },
    '/admin/events/{id}/fines': {
      get: {
        tags: ['Admin — Fine Settlements'],
        summary: 'Event fine report and closure estimate',
        description: 'Returns posted assessments, confirmed payments, outstanding balances, and estimates for ended sessions that remain open.',
        security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Event fine report' }, '404': { description: 'Event not found' } },
      },
    },
    '/admin/fines/balances': {
      get: {
        tags: ['Admin — Fine Settlements'],
        summary: 'List student fine balances',
        description: 'Query real-time student fine assessments and outstanding balances from `VwStudentFineBalances`.',
        security: bearer,
        parameters: [
          { name: 'student_id', in: 'query', schema: { type: 'integer' } },
          { name: 'student_number', in: 'query', schema: { type: 'string' } },
          { name: 'session_id', in: 'query', schema: { type: 'integer' } },
          { name: 'violation_code', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Student fine balances' },
        },
      },
    },
    '/admin/fines/payments': {
      post: {
        tags: ['Admin — Fine Settlements'],
        summary: 'Post student fine payment',
        description: 'Posts a confirmed payment and allocates amounts across fine assessments via `sp_fine_payment_post`.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['payment_reference', 'payment_method_code', 'total_amount', 'allocations'],
                properties: {
                  payment_reference: { type: 'string', example: 'PAY-2026-0001' },
                  payment_method_code: { type: 'string', enum: ['CASH', 'GCASH', 'BANK_TRANSFER', 'OTHER'] },
                  total_amount: { type: 'number', example: 150.00 },
                  external_payment_reference: { type: 'string', nullable: true },
                  allocations: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['assessment_id', 'amount'],
                      properties: {
                        assessment_id: { type: 'integer' },
                        amount: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Payment recorded' },
        },
      },
    },
    '/admin/fines/payments/{id}/void': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: {
        tags: ['Admin — Fine Settlements'],
        summary: 'Void payment',
        description: 'Voids confirmed payment and rolls back assessment balances via `sp_fine_payment_void`.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['void_reason'],
                properties: {
                  void_reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Payment voided' },
        },
      },
    },
    '/admin/fines/waivers': {
      post: {
        tags: ['Admin — Fine Settlements'],
        summary: 'Submit fine waiver request',
        description: 'Creates a pending waiver request via `sp_fine_waiver_request`.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['assessment_id', 'waiver_reason'],
                properties: {
                  assessment_id: { type: 'integer' },
                  waiver_reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Waiver requested' },
        },
      },
    },
    '/admin/fines/waivers/{id}/review': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: {
        tags: ['Admin — Fine Settlements'],
        summary: 'Review fine waiver request',
        description: 'Approve or reject pending waiver request via `sp_fine_waiver_review`.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['decision', 'review_notes'],
                properties: {
                  decision: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
                  review_notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Waiver decision recorded' },
        },
      },
    },
    '/admin/moderators': {
      get: {
        tags: ['Admin — Moderators'],
        summary: 'List moderators',
        security: bearer,
        responses: {
          '200': {
            description: 'Moderators',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Admin — Moderators'],
        summary: 'Create moderator',
        description:
          'Create a staff moderator with a special ID and password. ' +
          'The ID must not already be a user or student login. ' +
          'To reuse a student ID, POST `/admin/moderators/from-student` instead.',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'username', 'password'],
                properties: {
                  name: { type: 'string' },
                  username: {
                    type: 'string',
                    maxLength: 100,
                    description: 'Special login ID. Must not match an existing user or student ID.',
                  },
                  password: { type: 'string', minLength: 4 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          '409': {
            description: 'ID already taken by a user, or belongs to a student',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/moderators/from-student': {
      post: {
        tags: ['Admin — Moderators'],
        summary: 'Promote a student to moderator',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['student_id'],
                properties: {
                  student_id: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created from student',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          '409': {
            description: 'Student already a moderator, or student ID is taken',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/moderators/{id}/demote': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      post: {
        tags: ['Admin — Moderators'],
        summary: 'Demote a promoted student back to student',
        security: bearer,
        responses: {
          '200': { description: 'Demoted' },
          '400': {
            description: 'Not promoted from a student',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/moderators/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Moderators'],
        summary: 'Get moderator',
        security: bearer,
        responses: {
          '200': {
            description: 'Moderator',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
        },
      },
      put: {
        tags: ['Admin — Moderators'],
        summary: 'Update moderator',
        security: bearer,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  username: { type: 'string' },
                  password: { type: 'string', minLength: 4 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
          },
          '409': {
            description: 'New ID already taken by a user, or belongs to a student',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin — Moderators'],
        summary: 'Delete moderator',
        security: bearer,
        responses: {
          '204': { description: 'Deleted' },
          '409': {
            description: 'Has attendance scans',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/attendance': {
      get: {
        tags: ['Admin — Attendance'],
        summary: 'List attendance',
        security: bearer,
        parameters: [
          { name: 'event_id', in: 'query', schema: { type: 'integer' } },
          { name: 'student_id', in: 'query', schema: { type: 'integer' } },
          { name: 'session_window_id', in: 'query', schema: { type: 'integer' } },
          { name: 'scanned_by', in: 'query', schema: { type: 'integer' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['confirmed', 'cancelled'] },
          },
          { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'Logs',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/AttendanceLog' } },
              },
            },
          },
        },
      },
    },
    '/admin/attendance/export': {
      get: {
        tags: ['Admin — Attendance'],
        summary: 'Export attendance CSV',
        description: 'Same filters as list. Defaults to confirmed rows if `status` is omitted.',
        security: bearer,
        parameters: [
          { name: 'event_id', in: 'query', schema: { type: 'integer' } },
          { name: 'student_id', in: 'query', schema: { type: 'integer' } },
          { name: 'session_window_id', in: 'query', schema: { type: 'integer' } },
          { name: 'scanned_by', in: 'query', schema: { type: 'integer' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['confirmed', 'cancelled'] },
          },
          { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'CSV file',
            content: { 'text/csv': { schema: { type: 'string' } } },
          },
        },
      },
    },
    '/admin/attendance/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin — Attendance'],
        summary: 'Get attendance record',
        security: bearer,
        responses: {
          '200': {
            description: 'Record',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AttendanceLog' } },
            },
          },
        },
      },
      put: {
        tags: ['Admin — Attendance'],
        summary: 'Manually correct a record',
        security: bearer,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  direction: { type: 'string', enum: ['IN', 'OUT'] },
                  session_window_id: { type: 'integer' },
                  status: { type: 'string', enum: ['confirmed', 'cancelled'] },
                  scanned_at: { type: 'string', format: 'date-time' },
                  device_note: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AttendanceLog' } },
            },
          },
        },
      },
      delete: {
        tags: ['Admin — Attendance'],
        summary: 'Delete attendance record',
        security: bearer,
        responses: { '204': { description: 'Deleted' } },
      },
    },
    '/moderator/events/active': {
      get: {
        tags: ['Moderator'],
        summary: 'Active events for scanning',
        security: bearer,
        responses: {
          '200': {
            description: 'Today first, with current window id',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    server_time: { type: 'string', format: 'date-time' },
                    events: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Event' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/moderator/session-windows': {
      get: {
        tags: ['Moderator'],
        summary: 'Resolve Auto / manual session',
        security: bearer,
        parameters: [
          { name: 'event_id', in: 'query', required: true, schema: { type: 'integer' } },
          {
            name: 'mode',
            in: 'query',
            schema: { type: 'string', enum: ['auto', 'manual'], default: 'auto' },
          },
          {
            name: 'override',
            in: 'query',
            schema: { type: 'string' },
            description: 'Session label or window id (required when mode=manual)',
          },
        ],
        responses: {
          '200': {
            description: 'Selected window plus all windows',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    server_time: { type: 'string', format: 'date-time' },
                    mode: { type: 'string' },
                    selected: {
                      allOf: [{ $ref: '#/components/schemas/SessionWindow' }],
                      nullable: true,
                    },
                    windows: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SessionWindow' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/moderator/scans/mine': {
      get: {
        tags: ['Moderator'],
        summary: 'My scans',
        security: bearer,
        parameters: [
          { name: 'event_id', in: 'query', schema: { type: 'integer' } },
          { name: 'student_id', in: 'query', schema: { type: 'integer' } },
          { name: 'session_window_id', in: 'query', schema: { type: 'integer' } },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['confirmed', 'cancelled', 'all'] },
            description: 'Defaults to confirmed',
          },
          {
            name: 'date',
            in: 'query',
            schema: { type: 'string' },
            description: 'ISO date, or `all`. Defaults to today.',
          },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } },
        ],
        responses: {
          '200': {
            description: 'This moderator’s scans',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/AttendanceLog' } },
              },
            },
          },
        },
      },
    },
    '/moderator/scan/preview': {
      post: {
        tags: ['Moderator'],
        summary: 'Preview a scan (read-only)',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event_id'],
                properties: {
                  event_id: { type: 'integer' },
                  student_id_code: { type: 'string', description: 'Raw QR payload or student code' },
                  qr_payload: { type: 'string' },
                  session_window_id: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Preview',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ScanPreview' } },
            },
          },
          '422': {
            description: 'NO_ACTIVE_WINDOW',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'RATE_LIMITED',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/moderator/scan/confirm': {
      post: {
        tags: ['Moderator'],
        summary: 'Confirm a scan (writes IN/OUT)',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event_id', 'student_id', 'session_window_id'],
                properties: {
                  event_id: { type: 'integer' },
                  student_id: { type: 'integer' },
                  session_window_id: { type: 'integer' },
                  direction: {
                    type: 'string',
                    enum: ['IN', 'OUT'],
                    description: 'Optional stale-check against preview',
                  },
                  device_note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Confirmed',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AttendanceLog' } },
            },
          },
          '409': {
            description: 'ALREADY_COMPLETE or DIRECTION_CHANGED',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'RATE_LIMITED',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/moderator/scan/cancel': {
      post: {
        tags: ['Moderator'],
        summary: 'Cancel a scan (audit row only)',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event_id', 'student_id', 'session_window_id'],
                properties: {
                  event_id: { type: 'integer' },
                  student_id: { type: 'integer' },
                  session_window_id: { type: 'integer' },
                  direction: { type: 'string', enum: ['IN', 'OUT'] },
                  device_note: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Cancelled audit row',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AttendanceLog' } },
            },
          },
          '429': {
            description: 'RATE_LIMITED',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/student/me/events': {
      get: {
        tags: ['Student'],
        summary: 'Events the signed-in student is registered for',
        security: bearer,
        responses: {
          '200': { description: 'Registered events with session check-in status' },
        },
      },
    },
    '/student/me/fines': {
      get: {
        tags: ['Student'],
        summary: 'Fines for the signed-in student, grouped by event on the client',
        security: bearer,
        responses: {
          '200': { description: 'Student fine assessments' },
        },
      },
    },
    '/student/me/events/{eventId}/qr': {
      get: {
        tags: ['Student'],
        summary: 'Generate the event QR for the signed-in student',
        security: bearer,
        parameters: [{ name: 'eventId', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          '200': { description: 'Event QR token' },
          '409': { description: 'Event is not active' },
        },
      },
    },
    '/student/{code}/qr': {
      get: {
        tags: ['Student'],
        summary: 'Student QR payload',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'student_id_code',
          },
        ],
        responses: {
          '200': {
            description: 'QR + student',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    student: { $ref: '#/components/schemas/Student' },
                    qr_payload: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/student/{code}/attendance': {
      get: {
        tags: ['Student'],
        summary: 'Student attendance history',
        parameters: [
          {
            name: 'code',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
          { name: 'event_id', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 500 } },
        ],
        responses: {
          '200': {
            description: 'Confirmed scans',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    student: { $ref: '#/components/schemas/Student' },
                    attendance: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AttendanceLog' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/event-sessions/{id}/qr-tokens': {
      post: {
        tags: ['Admin — Events'],
        summary: 'Issue Event Session QR Token',
        security: bearer,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'eventSessionId',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  actionCode: { type: 'string', enum: ['IN', 'OUT', 'AUTO'], default: 'IN' },
                  validForSeconds: { type: 'integer', default: 60 },
                  overlapSeconds: { type: 'integer', default: 5 },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'QR token issued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    eventSessionQrTokenId: { type: 'string' },
                    eventSessionId: { type: 'string' },
                    actionCode: { type: 'string' },
                    validFromUtc: { type: 'string', format: 'date-time' },
                    expiresAtUtc: { type: 'string', format: 'date-time' },
                    qrValue: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/event-session-qr-tokens/{id}/revoke': {
      post: {
        tags: ['Admin — Events'],
        summary: 'Revoke Event Session QR Token',
        security: bearer,
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'eventSessionQrTokenId',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: { type: 'string', example: 'Displayed in wrong venue' },
                },
              },
            },
          },
        },
        responses: {
          '204': { description: 'QR token revoked successfully' },
        },
      },
    },
    '/admin/student-user-links': {
      post: {
        tags: ['Admin — Students'],
        summary: 'Link User account to Student record',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'studentId'],
                properties: {
                  userId: { type: 'integer' },
                  studentId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'User linked to student successfully' },
        },
      },
    },
    '/attendance/event-qr/self-scan': {
      post: {
        tags: ['Student'],
        summary: 'Student Self-Scan Event QR Code',
        security: bearer,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['qrToken'],
                properties: {
                  qrToken: { type: 'string', description: 'Raw QR token string displayed at event venue' },
                  clientRequestId: { type: 'string', format: 'uuid', description: 'Idempotency UUID for scan request' },
                  clientFingerprint: { type: 'string', description: 'Optional device/browser fingerprint' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Self-scan result',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scanResultCode: { type: 'string', enum: ['ACCEPTED', 'NO_CHANGE', 'REJECTED'] },
                    failureReasonCode: { type: 'string', nullable: true },
                    eventId: { type: 'string', nullable: true },
                    eventName: { type: 'string', nullable: true },
                    eventSessionId: { type: 'string', nullable: true },
                    sessionName: { type: 'string', nullable: true },
                    studentId: { type: 'string', nullable: true },
                    studentNumber: { type: 'string', nullable: true },
                    studentFullName: { type: 'string', nullable: true },
                    actionRecorded: { type: 'string', nullable: true },
                    attendanceStatus: { type: 'string', nullable: true },
                    recordedAtUtc: { type: 'string', format: 'date-time' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
