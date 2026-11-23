/**
 * Colors used in the app, defined for light and dark mode.
 * `tint` is the indigo accent used for selected tabs, buttons and highlights.
 * `trial` is a warm amber reserved for free trials, so they stand apart from paid subscriptions.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#14152B',
    textSecondary: '#5E6079',
    background: '#F6F6FB',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E8E8F6',
    border: '#DFE0EE',
    /** Fainter than `border`, for outlining cards rather than dividing things. */
    borderSubtle: '#EAEBF5',
    tint: '#4F46E5',
    tintSoft: '#E2E0FB',
    onTint: '#FFFFFF',
    trial: '#C2700F',
    trialSoft: '#FCEBD5',
    danger: '#C62828',
  },
  dark: {
    text: '#F1F1FA',
    textSecondary: '#A3A5C2',
    background: '#0E0F1F',
    // A step lighter than the background, so cards stand out from it as well as by their outline.
    backgroundElement: '#1A1B33',
    backgroundSelected: '#262845',
    border: '#2D2F50',
    borderSubtle: '#232541',
    tint: '#8B85FF',
    tintSoft: '#2B2866',
    onTint: '#0E0B3A',
    trial: '#F2A33A',
    trialSoft: '#3D2A10',
    danger: '#EF5350',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Nunito for titles and numbers; body text stays in the system font. Loaded at runtime in the root
 * layout (so it ships by OTA update), with only the 700 and 800 faces, so pair it with those weights.
 */
export const Fonts = {
  display: 'Nunito',
} as const;

export const DISPLAY_FONT_FACES = [
  {
    fontFamily: Fonts.display,
    fontDefinitions: [
      { path: require('@/assets/fonts/Nunito_700Bold.ttf'), weight: 700 },
      { path: require('@/assets/fonts/Nunito_800ExtraBold.ttf'), weight: 800 },
    ],
  },
];

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  twoAndHalf: 12,
  three: 16,
  threeAndHalf: 20,
  four: 24,
  five: 32,
  six: 64,
  /** Side padding of every screen, so content doesn't shift sideways between them. */
  screen: 20,
} as const;

/** Native tabs draw over screen content, so scrollable screens pad their bottom by this much. */
export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

export const Radius = {
  small: 8,
  medium: 12,
  large: 20,
  xl: 28,
  full: 999,
} as const;

/**
 * Card elevation. Light mode lifts cards off the background with a soft shadow; dark mode
 * shadows barely show, so cards there get a hairline border instead.
 */
export const Elevation = {
  light: {
    boxShadow: '0 1px 2px rgba(20, 21, 43, 0.04), 0 6px 20px rgba(20, 21, 43, 0.06)',
  },
  dark: {
    borderWidth: 1,
    borderColor: Colors.dark.borderSubtle,
  },
} as const;
