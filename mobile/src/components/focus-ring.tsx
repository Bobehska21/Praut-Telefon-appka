import Svg, { Circle } from 'react-native-svg';

/**
 * Circular progress ring. `progress` is the share still remaining (1 = full, 0 = empty), so the
 * ring drains clockwise as a session runs. `null` draws only the track.
 */
export function FocusRing({
  size,
  stroke,
  progress,
  color,
  trackColor,
}: {
  size: number;
  stroke: number;
  progress: number | null;
  color: string;
  trackColor: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const remaining = progress === null ? 0 : Math.min(1, Math.max(0, progress));

  return (
    // Start at 12 o'clock instead of 3 o'clock.
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
      {progress !== null && remaining > 0 && (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - remaining)}
        />
      )}
    </Svg>
  );
}
