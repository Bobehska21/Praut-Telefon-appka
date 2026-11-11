import { useEffect, useState } from 'react';

import { FocusModule } from '@/modules/focus';
import { useAppStore } from '@/store';
import { totalXp } from './progress/engine';
import { levelForXp, rankKey } from './progress/xp';
import { safeNickname } from './nickname';
import { computeStreaks } from './stats';

/**
 * Keeps the native layer informed of what to share with accepted nearby users (nickname, rank, level,
 * streak) and whether the feature is switched on. Mount once, at the root.
 */
export function useNearbySync(): void {
  const nickname = useAppStore((s) => s.settings.nickname ?? '');
  const enabled = useAppStore((s) => s.settings.nearbyEnabled !== false);
  const sessions = useAppStore((s) => s.sessions);
  const claimed = useAppStore((s) => s.claimed);
  const achievements = useAppStore((s) => s.achievements);

  // Rank and streak change slowly, so re-checking every few minutes is plenty (and rolls the streak over at midnight).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const level = levelForXp(totalXp({ sessions, claimed, achievements }, now));
    void FocusModule.setNearby({
      enabled,
      nickname: safeNickname(nickname),
      rank: rankKey(level),
      level,
      streak: computeStreaks(sessions, now).current,
    });
  }, [enabled, nickname, sessions, claimed, achievements, now]);
}
