import { FocusModule } from '@/modules/focus';
import { evaluateProgress } from '@/features/progress/engine';
import { useAppStore } from '@/store';

/**
 * Orchestrates native calls and the JS store. The native side is the source of
 * truth for whether focus mode is running (it survives app kill and reboot);
 * the store mirrors it for the UI and keeps history.
 */

export async function startFocus(profileId: string, durationMs: number | null): Promise<void> {
  const state = useAppStore.getState();
  const profile = state.profiles.find((p) => p.id === profileId);
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);

  if (FocusModule.platform === 'android') {
    await FocusModule.setAllowedApps(profile.id, profile.allowedAppIds);
  }
  const status = await FocusModule.startFocus(profile.id, durationMs);
  state.beginSession({
    profileId: profile.id,
    startedAt: status.startedAt ?? Date.now(),
    endsAt: status.endsAt,
  });
}

export async function stopFocus(): Promise<void> {
  await FocusModule.stopFocus();
  useAppStore.getState().endSession(Date.now());
  evaluateProgress();
}

/** Call on app start and whenever the app returns to foreground. */
export async function syncWithNative(): Promise<void> {
  const state = useAppStore.getState();
  const status = await FocusModule.getStatus();

  if (state.session && !status.active) {
    // Timer expired natively while the app was not running.
    state.endSession(state.session.endsAt ?? Date.now());
    evaluateProgress();
  } else if (!state.session && status.active && status.profileId && status.startedAt) {
    // Started natively, e.g. by a schedule.
    state.beginSession({
      profileId: status.profileId,
      startedAt: status.startedAt,
      endsAt: status.endsAt,
    });
  }

  for (const attempt of await FocusModule.drainBlockedAttempts()) {
    state.recordAttempt(attempt);
  }
}

/** Push the schedule list to native so schedules fire while the app is closed. */
export async function syncSchedules(): Promise<void> {
  const { schedules } = useAppStore.getState();
  await FocusModule.setSchedules(
    schedules
      .filter((s) => s.enabled)
      .map(({ profileId, days, startMinute, endMinute }) => ({
        profileId,
        days,
        startMinute,
        endMinute,
      })),
  );
}
