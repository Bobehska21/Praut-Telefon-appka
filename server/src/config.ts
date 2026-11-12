import { z } from 'zod';
import { isValidTimezone } from './time';

const int = (def: number) => z.coerce.number().int().positive().default(def);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_TOKEN: z.string().min(32, 'ADMIN_TOKEN must be at least 32 characters'),
  NODE_ENV: z.string().default('development'),
  PORT: int(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_POOL_MAX: int(10),
  DB_STATEMENT_TIMEOUT_MS: int(5000),
  LEADERBOARD_TZ: z.string().default('Europe/Prague').refine(isValidTimezone, 'invalid IANA timezone'),
  PHOTO_DIR: z.string().default('./data/photos'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SHUTDOWN_TIMEOUT_MS: int(20_000),
  RATE_LIMIT_GLOBAL_PER_MIN: int(300),
  RATE_LIMIT_REGISTER_PER_HOUR: int(20),
  RATE_LIMIT_CHALLENGE_PER_MIN: int(20),
  RATE_LIMIT_REPORT_PER_HOUR: int(10),
  RATE_LIMIT_LOGIN_PER_MIN: int(10),
  DEV_FAKE_MINUTES: z.enum(['true', 'false']).default('false'),
  PASSWORD_SCRYPT_LOG2N: z.coerce.number().int().min(10).max(18).default(15),
});

export interface Config {
  databaseUrl: string;
  adminToken: string;
  nodeEnv: string;
  port: number;
  host: string;
  logLevel: string;
  dbPoolMax: number;
  dbStatementTimeoutMs: number;
  leaderboardTz: string;
  photoDir: string;
  trustProxy: boolean;
  shutdownTimeoutMs: number;
  eventsPollMs: number;
  passwordScryptLog2N: number;
  /** Development only: enables POST /v1/dev/focus-minutes. Refused in production. */
  devFakeMinutes: boolean;
  rateLimit: { globalPerMin: number; registerPerHour: number; challengePerMin: number; reportPerHour: number; loginPerMin: number };
}

/** Reads configuration from the environment only; throws (fail fast) listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const problems = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  const e = r.data;
  if (e.DEV_FAKE_MINUTES === 'true' && e.NODE_ENV === 'production') {
    throw new Error('Invalid configuration: DEV_FAKE_MINUTES=true is not allowed when NODE_ENV=production');
  }
  return {
    databaseUrl: e.DATABASE_URL,
    adminToken: e.ADMIN_TOKEN,
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    dbPoolMax: e.DB_POOL_MAX,
    dbStatementTimeoutMs: e.DB_STATEMENT_TIMEOUT_MS,
    leaderboardTz: e.LEADERBOARD_TZ,
    photoDir: e.PHOTO_DIR,
    trustProxy: e.TRUST_PROXY === 'true',
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    eventsPollMs: 1000,
    passwordScryptLog2N: e.PASSWORD_SCRYPT_LOG2N,
    devFakeMinutes: e.DEV_FAKE_MINUTES === 'true',
    rateLimit: {
      globalPerMin: e.RATE_LIMIT_GLOBAL_PER_MIN,
      registerPerHour: e.RATE_LIMIT_REGISTER_PER_HOUR,
      challengePerMin: e.RATE_LIMIT_CHALLENGE_PER_MIN,
      reportPerHour: e.RATE_LIMIT_REPORT_PER_HOUR,
      loginPerMin: e.RATE_LIMIT_LOGIN_PER_MIN,
    },
  };
}
