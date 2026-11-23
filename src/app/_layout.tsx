import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { DevVariantLabel } from '@/components/dev-variant-label';
import { ReminderScheduler } from '@/components/reminder-scheduler';
import { StackHeader } from '@/components/stack-header';
import { Colors, DISPLAY_FONT_FACES } from '@/constants/theme';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';
import { applySavedThemePreference, useColorScheme } from '@/lib/theme-preference';

applySavedThemePreference();

// Kept up until the fonts load, so titles don't flash in the system font.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // On error the text falls back to the system font rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts(DISPLAY_FONT_FACES);
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      onInit={migrateDbIfNeeded}
      options={{ enableChangeListener: true }}>
      <RootNavigator />
    </SQLiteProvider>
  );
}

/**
 * Apart from the provider because `SQLiteProvider` ignores new `children` when re-rendered, so
 * anything that can change after launch has to be read in here, below it.
 */
function RootNavigator() {
  const scheme = useColorScheme();
  const colors = Colors[scheme];
  const baseTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;

  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <>
      <ReminderScheduler />
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ header: (props) => <StackHeader {...props} /> }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="subscription/[id]" />
          <Stack.Screen name="subscription/edit" options={{ presentation: 'modal' }} />
          <Stack.Screen name="subscription/price-change" options={{ presentation: 'modal' }} />
          <Stack.Screen name="subscription/cancel" options={{ presentation: 'modal' }} />
          <Stack.Screen name="restore" options={{ presentation: 'modal' }} />
        </Stack>
        <DevVariantLabel />
      </ThemeProvider>
    </>
  );
}
