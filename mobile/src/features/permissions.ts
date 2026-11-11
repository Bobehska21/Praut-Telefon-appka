import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { FocusModule, type PermissionMap, type PermissionName } from '@/modules/focus';

/**
 * Permissions focus mode cannot start without. On Android the accessibility service is what makes
 * blocking immediate and reliable; notifications and the battery exemption keep it alive.
 */
export const REQUIRED_PERMISSIONS: PermissionName[] =
  FocusModule.platform === 'ios' ? ['screenTime'] : ['accessibility', 'notificationAccess', 'notifications', 'batteryOptimization'];

/** Asked for during onboarding but not needed to start. */
export const OPTIONAL_PERMISSIONS: PermissionName[] =
  FocusModule.platform === 'ios' ? [] : ['bluetooth', 'defaultLauncher', 'exactAlarm'];

/**
 * Current permission state, re-read whenever the app returns to the foreground (most permissions are
 * granted on a system screen, so the answer is only known after the user comes back).
 */
export function usePermissions() {
  const [perms, setPerms] = useState<PermissionMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void FocusModule.getPermissions().then((result) => {
        if (cancelled) return;
        setPerms(result);
        setLoaded(true);
      });
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const missing = REQUIRED_PERMISSIONS.filter((name) => perms[name] !== 'granted');
  return { perms, loaded, missing };
}
