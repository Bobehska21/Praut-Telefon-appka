export type ErrorCode =
  | 'needs_minutes' | 'immune' | 'not_wasteman' | 'already_killed' | 'expired' | 'bad_signature'
  | 'blocked' | 'multiplayer_off' | 'forbidden' | 'not_found' | 'validation' | 'rate_limited'
  | 'unauthorized' | 'conflict' | 'internal' | 'unavailable';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  needs_minutes: 403,
  immune: 409,
  not_wasteman: 409,
  already_killed: 409,
  expired: 410,
  bad_signature: 400,
  blocked: 403,
  multiplayer_off: 403,
  forbidden: 403,
  not_found: 404,
  validation: 400,
  rate_limited: 429,
  unauthorized: 401,
  conflict: 409,
  internal: 500,
  unavailable: 503,
};

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.status = STATUS_BY_CODE[code];
  }
  body() {
    return { error: { code: this.code, message: this.message, ...this.extra } };
  }
}
