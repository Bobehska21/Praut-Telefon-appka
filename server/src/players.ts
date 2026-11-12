import type { Queryable } from './db/pool';

export interface PlayerRow {
  id: string;
  token_hash: Buffer;
  public_key: string;
  nickname: string;
  rank_key: string;
  level: number;
  multiplayer_enabled: boolean;
  timezone: string;
  focus_state: 'idle' | 'focus' | 'wasteman';
  focus_started_at: Date | null;
  last_heartbeat_at: Date | null;
  immune_until: Date | null;
  banned_at: Date | null;
  ban_reason: string | null;
  photo_key: string | null;
  photo_updated_at: Date | null;
  created_at: Date;
}

export const LOST_AFTER_MS = 10 * 60_000;

/** `lost` is evaluated lazily: a focus player without a heartbeat for >10 min is idle. */
export function effectiveState(p: PlayerRow, now: Date): 'idle' | 'focus' | 'wasteman' {
  if (p.focus_state === 'focus') {
    const last = p.last_heartbeat_at?.getTime() ?? 0;
    if (now.getTime() - last > LOST_AFTER_MS) return 'idle';
  }
  return p.focus_state;
}

export function photoUrl(p: Pick<PlayerRow, 'id' | 'photo_key' | 'photo_updated_at'>): string | null {
  return p.photo_key ? `/v1/photos/${p.id}?v=${p.photo_updated_at?.getTime() ?? 0}` : null;
}

export async function getPlayer(db: Queryable, id: string): Promise<PlayerRow | null> {
  return (await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [id])).rows[0] ?? null;
}

/** True if either player has blocked the other. */
export async function isBlockedEitherWay(db: Queryable, a: string, b: string): Promise<boolean> {
  const r = await db.query(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1',
    [a, b],
  );
  return r.rowCount === 1;
}
