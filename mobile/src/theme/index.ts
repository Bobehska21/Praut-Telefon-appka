import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F5F1',
  surface: '#FFFFFF',
  text: '#1D2420',
  textMuted: '#66706A',
  primary: '#3E6B5A',
  onPrimary: '#FFFFFF',
  border: '#E1DFD8',
  danger: '#A5483C',
} as const;

const dark = {
  background: '#141816',
  surface: '#1E2421',
  text: '#ECEFEC',
  textMuted: '#9AA39D',
  primary: '#7FB09B',
  onPrimary: '#10231A',
  border: '#2B332F',
  danger: '#E0877B',
} as const;

export type Palette = { [K in keyof typeof light]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;
export const radius = { sm: 8, md: 14, lg: 28 } as const;

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
