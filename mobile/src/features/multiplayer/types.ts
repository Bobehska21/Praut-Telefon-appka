export type PlayerStatus = 'focus' | 'wasteman' | 'immune' | 'idle';

export type RankKey = 'novice' | 'apprentice' | 'adept' | 'warden' | 'master' | 'grandmaster';

/** Why a kill is not possible right now (shown on a disabled button). */
export type KillBlockedReason = 'needs_minutes' | 'immune' | 'not_wasteman' | 'blocked' | 'multiplayer_off' | 'out_of_range' | null;

export interface NearbyPlayer {
  /** The rotating Bluetooth token this player was seen with. */
  token: string;
  playerId: string;
  nickname: string;
  rankKey: RankKey;
  level: number;
  photoUrl: string | null;
  status: PlayerStatus;
  /** ISO time when immunity ends, for `immune`. */
  immuneUntil: string | null;
  canKill: boolean;
  killBlockedReason: KillBlockedReason;
  /** Minutes of focus the viewer still needs today before they may kill. */
  missingMinutes: number;
}

export interface MyProfile {
  playerId: string;
  nickname: string;
  rankKey: RankKey;
  level: number;
  photoUrl: string | null;
  multiplayerEnabled: boolean;
  timezone: string;
  state: 'idle' | 'focus' | 'wasteman';
  immuneUntil: string | null;
}

export interface MyStats {
  killsToday: number;
  killsTotal: number;
  deathsToday: number;
  deathsTotal: number;
  pointsToday: number;
  pointsTotal: number;
  focusMinutesToday: number;
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  rankKey: RankKey;
  level: number;
  photoUrl: string | null;
  kills: number;
  /** True for the caller's own row. Rows carry no player id. */
  isMe: boolean;
}

export interface Leaderboard {
  date: string;
  /** Top 50 by kills that day. */
  top: LeaderboardEntry[];
  /** The caller's real rank (null when unranked) and kills, even below the top 50. */
  me: { rank: number | null; kills: number };
}

/** Result of `POST /v1/kills`. */
export interface KillResult {
  challengeId: string;
  victimPlayerId: string;
  pointsGained: number;
  victimPointsLost: number;
  victimImmuneUntil: string;
  killedAt: string;
}

export type ReportKind = 'nickname' | 'photo' | 'player';

export interface BlockedPlayer {
  playerId: string;
  nickname: string;
  rankKey?: RankKey;
  level?: number;
  blockedAt?: string;
}
