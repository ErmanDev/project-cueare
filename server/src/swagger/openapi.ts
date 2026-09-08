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
      'LAN-only REST API for QR event attendance. ' +
      'Authorize with a JWT from `POST /auth/login`. ' +
      '`/admin/*` is superadmin-only; `/moderator/*` is moderator-only; `/student/*` is public (LAN).',
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
          role: { type: 'string', enum: ['superadmin', 'moderator'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Student: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          student_id_code: { type: 'string', example: 'STU-2026-0001' },
          full_name: { type: 'string' },
          section: { type: 'string', nullable: true },
          photo_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
          qr_payload: { type: 'string', description: 'Value encoded in the student QR' },
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
          student_name: { type: 'string', nullable: true },
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
          username: { type: 'string', example: 'admin' },
          password: { type: 'string', example: 'changeme123' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          role: { type: 'string', enum: ['superadmin', 'moderator'] },
          user: { $ref: '#/components/schemas/User' },
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
        ],
        responses: {
          '200': {
            description: 'Students with QR payloads',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Student' } },
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
          'JSON `{csv}` / `{students}` or raw `text/csv`. Existing codes are upserted unless `mode=skip`.',
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
                  csv: { type: 'string' },
                  students: {
                    type: 'array',
                    items: {
                      type: 'object',
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
            },
            'text/csv': { schema: { type: 'string' } },
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
                  username: { type: 'string' },
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
  },
};
