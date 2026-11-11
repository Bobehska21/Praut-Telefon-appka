import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { radius, spacing, useTheme } from '@/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const t = useTheme();
  const content = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.background }]}>{content}</SafeAreaView>
  );
}

export function AppText({
  muted,
  accent,
  size = 16,
  weight = '400',
  style,
  ...rest
}: TextProps & {
  muted?: boolean;
  /** Bright red, for headings and key numbers. */
  accent?: boolean;
  size?: number;
  weight?: '400' | '500' | '600' | '700';
}) {
  const t = useTheme();
  const color = accent ? t.accent : muted ? t.textMuted : t.text;
  return <Text {...rest} style={[{ color, fontSize: size, fontWeight: weight }, style]} />;
}

/** Screen heading: tracked-out capitals with a short red rule underneath. */
export function Heading({ children }: { children: string }) {
  const t = useTheme();
  return (
    <View style={styles.heading}>
      <AppText size={22} weight="700" style={styles.headingText}>
        {children.toLocaleUpperCase()}
      </AppText>
      <View style={[styles.rule, { backgroundColor: t.primary }]} />
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const t = useTheme();
  const filled = variant === 'primary' || variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: filled ? t.primary : 'transparent',
          borderColor: filled ? t.primary : t.border,
          borderWidth: 1,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}>
      <AppText weight="700" size={15} style={[styles.buttonLabel, { color: filled ? t.onPrimary : t.accent }]}>
        {label.toLocaleUpperCase()}
      </AppText>
    </Pressable>
  );
}

export function ThemedSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: t.border, true: t.primary }}
      thumbColor={value ? t.onPrimary : t.textMuted}
    />
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? t.primary : t.border, backgroundColor: selected ? t.primary : t.surface },
      ]}>
      <AppText size={14} weight="600" style={{ color: selected ? t.onPrimary : t.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, flexGrow: 1 },
  heading: { gap: spacing.sm, marginBottom: spacing.xs },
  headingText: { letterSpacing: 2 },
  rule: { width: 36, height: 3, borderRadius: 2 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: { letterSpacing: 1 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
