/**
 * Dark red-and-black theme, always on (no light variant). Red is an accent, not a wash: fills use
 * `primary` (white text on it has 4.8:1 contrast), red text and icons on black use the brighter
 * `accent` (6:1), because plain `primary` on black is only ~4:1.
 */
const palette = {
  background: '#0B0809',
  surface: '#151012',
  surfaceRaised: '#1E1417',
  text: '#F2E9E9',
  textMuted: '#A89A9A',
  primary: '#E5202A',
  accent: '#FF4D54',
  onPrimary: '#FFFFFF',
  border: '#3A1519',
  danger: '#FF5A5A',
} as const;

export type Palette = { [K in keyof typeof palette]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;
export const radius = { sm: 8, md: 14, lg: 28 } as const;

export function useTheme(): Palette {
  return palette;
}
