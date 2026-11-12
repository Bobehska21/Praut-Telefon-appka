import { z } from 'zod';
import { checkNickname } from './nickname';
import { isRealDate, isValidTimezone } from './time';

export const RANK_KEYS = ['novice', 'apprentice', 'adept', 'warden', 'master', 'grandmaster'] as const;

export const uuid = z.string().uuid();
export const dayString = z.string().refine(isRealDate, 'expected a real date, YYYY-MM-DD');

export const nicknameField = z.string().max(100).superRefine((v, ctx) => {
  const r = checkNickname(v);
  if (r !== 'ok' && r !== 'empty') ctx.addIssue({ code: 'custom', message: `nickname rejected: ${r}`, params: { reason: r } });
});

export const profileBody = z.object({
  nickname: nicknameField,
  rankKey: z.enum(RANK_KEYS),
  level: z.number().int().min(1).max(999),
  multiplayerEnabled: z.boolean(),
  timezone: z.string().max(64).refine(isValidTimezone, 'invalid IANA timezone'),
});

export const registerBody = z.object({ publicKey: z.string().min(80).max(200) });
