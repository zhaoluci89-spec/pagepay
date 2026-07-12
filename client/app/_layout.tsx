import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useEffect, useState } from 'react';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import * as LocalAuthentication from 'expo-local-authentication';
import 'react-native-reanimated';

import { useEffectiveScheme } from '@/src/shared/hooks/use-effective-scheme';
import { useAdsConfig } from '@/src/shared/hooks/use-ads-config';
import { bootstrapPreferences, usePreferences } from '@/src/shared/lib/preferences';
import { getToken } from '@/src/shared/lib/storage';
import { getLastRoute, saveLastRoute, clearLastRoute } from '@/src/shared/lib/screen-memory';
import { initializeAdMob } from '@/src/shared/lib/ads-native';
import { setOnUnauthenticated } from '@/src/shared/api/client';
import { setupNotificationListeners, registerFCMToken } from '@/src/lib/notifications';
import { SplashOverlay } from '@/components/SplashOverlay';
import '@/src/lib/i18n';

const queryClient = new QueryClient();

export const unstable_settings = {
  // Intentionally no anchor — the auth gate in useAuthGate controls
  // the initial route. Setting anchor here would let Expo Router
  // render the tabs layout before the auth check completes.
};

function useAuthGate() {
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const onboardingCompleted = usePreferences((s) => s.onboardingCompleted);
  const hydrated = usePreferences((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();

      if (!token) {
        await clearLastRoute().catch(() => {});
        if (!onboardingCompleted) {
          (router as any).replace('/(onboarding)');
        } else {
          (router as any).replace('/(auth)/');
        }
        await new Promise((r) => setTimeout(r, 50));
        if (!cancelled) setIsReady(true);
        return;
      }

      const prefs = usePreferences.getState();
      if (prefs.biometricEnabled) {
        try {
          const supported = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (supported && enrolled) {
            const result = await LocalAuthentication.authenticateAsync({
              promptMessage: Platform.select({
                ios: 'Authenticate to access PagePay',
                android: 'Biometric authentication',
              }),
              fallbackLabel: 'Use passcode',
              cancelLabel: 'Cancel',
              disableDeviceFallback: false,
            });
            if (!result.success) {
              const lastRoute = await getLastRoute();
              (router as any).replace('/pin/verify?mode=verify&redirect=' + (lastRoute || '/(tabs)'));
              await new Promise((r) => setTimeout(r, 50));
              if (!cancelled) setIsReady(true);
              return;
            }
          }
        } catch {
          const lastRoute = await getLastRoute();
          (router as any).replace('/pin/verify?mode=verify&redirect=' + (lastRoute || '/(tabs)'));
          await new Promise((r) => setTimeout(r, 50));
          if (!cancelled) setIsReady(true);
          return;
        }
      }

      const lastRoute = await getLastRoute();
      (router as any).replace(lastRoute || '/(tabs)');
      await new Promise((r) => setTimeout(r, 50));
      if (!cancelled) setIsReady(true);
    })();
    return () => { cancelled = true; };
  }, [hydrated, router]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const inAuthGroup = segments[0] === '(auth)';
      const inOnboardingGroup = segments[0] === '(onboarding)';
      if (inAuthGroup || inOnboardingGroup) return;
      if (segments[0] === 'pin') return;
      const pathname = '/' + segments.join('/');
      if (pathname && pathname !== '/') {
        await saveLastRoute(pathname).catch(() => {});
      }
    })();
  }, [hydrated, segments]);

  useEffect(() => {
    let lastState: AppStateStatus = AppState.currentState;
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      const wasInactive = lastState === 'inactive';
      const nowActive = nextState === 'active';
      lastState = nextState;
      if (!wasInactive || !nowActive) return;

      try {
        const pathname = '/' + segments.join('/');
        await saveLastRoute(pathname).catch(() => {});
      } catch { /* non-fatal */ }

      const token = await getToken();
      if (!token) return;
      const prefs = usePreferences.getState();
      if (!prefs.biometricEnabled) return;

      try {
        const { useBiometricAuth } = await import('@/src/shared/hooks/use-biometric-auth');
        const { authenticate } = useBiometricAuth();
        const result = await authenticate();
        if (!result.success) {
          const lastRoute = await getLastRoute();
          (router as any).replace('/pin/verify?mode=verify&redirect=' + (lastRoute || '/(tabs)'));
        }
      } catch {
        const lastRoute = await getLastRoute();
        (router as any).replace('/pin/verify?mode=verify&redirect=' + (lastRoute || '/(tabs)'));
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [router, segments]);

  useEffect(() => {
    setOnUnauthenticated(() => {
      if (segments[0] !== '(auth)' && segments[0] !== '(onboarding)') {
        (router as any).replace('/(auth)/');
      }
    });
  }, [router, segments]);

  return isReady;
}

/** Ad SDK bootstrap. Mounts the native AdMob SDK (via
 *  `react-native-google-mobile-ads`) and warms the
 *  `useAdsConfig` cache so the rest of the app can resolve
 *  unit IDs without a render-blocking fetch.
 *
 *  The init is fire-and-forget: a failed native init just
 *  means ads are disabled and the MockAdModal takes over.
 *  The config fetch is non-blocking too — the hooks return
 *  `data = undefined` until the request resolves and the
 *  ad components fall back to the placeholder.
 *
 *  This hook is mounted at the root so the SDK is warm by
 *  the time the catalog renders its first page. The AdMob
 *  SDK's `initialize()` is idempotent so re-mounts on
 *  theme / auth changes are safe. */
function AdsBootstrapComponent() {
  useAdsConfig();
  // Kick off the native init. We don't await — the layout
  // must render immediately and the SDK is happy to finish
  // initializing in the background.
  useEffect(() => {
    initializeAdMob().catch(() => undefined);
  }, []);
  return null;
}

export default function RootLayout() {
  const colorScheme = useEffectiveScheme();
  const isReady = useAuthGate();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  // Boot preferences once. The auth gate's `hydrated` selector means
  // it won't run until this resolves; the SplashOverlay fills the
  // gap so the user sees motion instead of a blank screen.
  useEffect(() => {
    const initApp = async () => {
      await bootstrapPreferences();
      
      // Initialize i18n with user's saved language preference
      const i18n = await import('@/src/lib/i18n');
      const prefs = usePreferences.getState();
      if (prefs.language && prefs.language !== 'en') {
        await i18n.default.changeLanguage(prefs.language);
      }
    };
    void initApp();
  }, []);

  // Initialize Firebase Cloud Messaging and notification listeners
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const initNotifications = async () => {
      cleanup = setupNotificationListeners();
      const token = await getToken();
      if (token) {
        await registerFCMToken();
      }
    };

    initNotifications();

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  // Splash overlay state. Native splash (expo-splash-screen) shows first
  // as a static image while JS loads. Once fonts are loaded and auth is
  // ready, we show the animated SplashOverlay which hides the native splash
  // and runs the full animation sequence. When complete, it calls onDone
  // to dismiss and reveal the app.
  const [splashDismissed, setSplashDismissed] = useState(false);

  if (!isReady || !fontsLoaded) {
    // Show animated splash overlay during initialization.
    // Native splash (expo-splash-screen) shows first, then we take over
    // with the full animated sequence when JS loads and fonts are ready.
    if (!splashDismissed) {
      return <SplashOverlay onDone={() => setSplashDismissed(true)} />;
    }
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AdsBootstrapComponent />
        <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ headerShown: false, title: 'Book' }} />
        <Stack.Screen name="study/chat/[id]" options={{ headerShown: false, title: 'Study Chat' }} />
        <Stack.Screen name="tasks/[id]" options={{ headerShown: false, title: 'Task Detail' }} />
        <Stack.Screen name="tasks/[id]/complete" options={{ headerShown: false, title: 'Submit Proof' }} />
        <Stack.Screen name="tasks/profile" options={{ headerShown: false, title: 'Worker Profile' }} />
        <Stack.Screen name="tasks/history" options={{ headerShown: false, title: 'Submission History' }} />
        <Stack.Screen name="sponsor/register" options={{ headerShown: false, title: 'Become a Sponsor' }} />
        <Stack.Screen name="sponsor/kyc" options={{ headerShown: false, title: 'KYC Verification' }} />
        <Stack.Screen name="sponsor/dashboard" options={{ headerShown: false, title: 'Sponsor Dashboard' }} />
        <Stack.Screen name="sponsor/tasks/create" options={{ headerShown: false, title: 'Create Task' }} />
        <Stack.Screen name="sponsor/tasks/[id]" options={{ headerShown: false, title: 'Task Submissions' }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false, title: 'Reset Password' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, title: 'New Password' }} />
        <Stack.Screen name="buy-airtime" options={{ headerShown: false, title: 'Buy Airtime' }} />
        <Stack.Screen name="buy-data" options={{ headerShown: false, title: 'Buy Data' }} />
        <Stack.Screen name="buy-electricity" options={{ headerShown: false, title: 'Buy Electricity' }} />
        <Stack.Screen name="buy-tv" options={{ headerShown: false, title: 'Buy TV Subscription' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="pin/verify" options={{ headerShown: false, title: 'Enter PIN' }} />
        <Stack.Screen name="pin/setup" options={{ headerShown: false, title: 'Set PIN' }} />
        <Stack.Screen name="pin/change" options={{ headerShown: false, title: 'Change PIN' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
