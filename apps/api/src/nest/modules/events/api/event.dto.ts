import { badRequest } from '../../../../utils/errors.ts';

const CREATE_FIELDS = new Set([
  'name',
  'event_start_date',
  'event_end_date',
  'academic_term_id',
  'is_active',
]);
const UPDATE_FIELDS = CREATE_FIELDS;

function objectBody(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw badRequest('Request body must be a JSON object');
  }
  return raw as Record<string, unknown>;
}

function rejectUnknownFields(
  body: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw badRequest(`Unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`, {
      code: 'UNKNOWN_FIELD',
      fields: unknown,
    });
  }
}

function requiredName(body: Record<string, unknown>): string {
  const value = body.name;
  if (typeof value !== 'string' || !value.trim()) throw badRequest('name is required');
  const name = value.trim();
  if (name.length > 200) throw badRequest('name must be 200 characters or fewer');
  return name;
}

function optionalName(body: Record<string, unknown>): string | undefined {
  if (!Object.hasOwn(body, 'name')) return undefined;
  return requiredName(body);
}

function dateOnly(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} must use YYYY-MM-DD`);
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw badRequest(`${field} must be a valid calendar date`);
  }
  return date;
}

function requiredDate(body: Record<string, unknown>, field: string): Date {
  if (!Object.hasOwn(body, field)) throw badRequest(`${field} is required`);
  return dateOnly(body[field], field);
}

function optionalDate(body: Record<string, unknown>, field: string): Date | undefined {
  return Object.hasOwn(body, field) ? dateOnly(body[field], field) : undefined;
}

function optionalPositiveInt(
  body: Record<string, unknown>,
  field: string,
): number | undefined {
  if (!Object.hasOwn(body, field)) return undefined;
  const value = body[field];
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw badRequest(`${field} must be a positive integer`);
  }
  return Number(value);
}

function optionalBoolean(
  body: Record<string, unknown>,
  field: string,
): boolean | undefined {
  if (!Object.hasOwn(body, field)) return undefined;
  if (typeof body[field] !== 'boolean') throw badRequest(`${field} must be a boolean`);
  return body[field];
}

export class CreateEventDto {
  private constructor(
    readonly name: string,
    readonly eventStartDate: Date,
    readonly eventEndDate: Date,
    readonly academicTermId: number | undefined,
    readonly isActive: boolean,
  ) {}

  static parse(raw: unknown): CreateEventDto {
    const body = objectBody(raw);
    rejectUnknownFields(body, CREATE_FIELDS);
    return new CreateEventDto(
      requiredName(body),
      requiredDate(body, 'event_start_date'),
      requiredDate(body, 'event_end_date'),
      optionalPositiveInt(body, 'academic_term_id'),
      optionalBoolean(body, 'is_active') ?? true,
    );
  }
}

export class UpdateEventDto {
  private constructor(
    readonly name: string | undefined,
    readonly eventStartDate: Date | undefined,
    readonly eventEndDate: Date | undefined,
    readonly academicTermId: number | undefined,
    readonly isActive: boolean | undefined,
  ) {}

  static parse(raw: unknown): UpdateEventDto {
    const body = objectBody(raw);
    rejectUnknownFields(body, UPDATE_FIELDS);
    if (Object.keys(body).length === 0) throw badRequest('At least one event field is required');
    return new UpdateEventDto(
      optionalName(body),
      optionalDate(body, 'event_start_date'),
      optionalDate(body, 'event_end_date'),
      optionalPositiveInt(body, 'academic_term_id'),
      optionalBoolean(body, 'is_active'),
    );
  }
}
