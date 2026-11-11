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
  playerId: string;
  nickname: string;
  rankKey: RankKey;
  level: number;
  photoUrl: string | null;
  kills: number;
  rank: number;
}

export interface Leaderboard {
  date: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
}

export interface KillResult {
  pointsGained: number;
  victimNickname: string;
  immuneUntil: string;
}

export type ReportKind = 'nickname' | 'photo' | 'player';

export interface BlockedPlayer {
  playerId: string;
  nickname: string;
}
