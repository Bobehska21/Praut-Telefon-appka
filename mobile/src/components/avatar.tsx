import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { photoSource } from '@/features/multiplayer/api';
import { useTheme } from '@/theme';

/** Profile photo, or the default avatar when there is none (or it cannot be loaded). */
export function Avatar({ photoUrl, size = 48, version = 0 }: { photoUrl: string | null; size?: number; version?: number }) {
  const theme = useTheme();
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void photoSource(photoUrl).then((s) => {
      if (!alive) return;
      setFailed(false);
      // `version` busts the image cache after the user replaces their photo.
      setSource(s ? { ...s, uri: version ? `${s.uri}${s.uri.includes('?') ? '&' : '?'}v=${version}` : s.uri } : null);
    });
    return () => {
      alive = false;
    };
  }, [photoUrl, version]);

  const box = { width: size, height: size, borderRadius: size / 2, borderColor: theme.border, backgroundColor: theme.surfaceRaised };
  if (source && !failed) {
    return <Image source={source} style={[styles.base, box]} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.base, styles.center, box]}>
      <Ionicons name="person" size={size * 0.55} color={theme.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderWidth: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
