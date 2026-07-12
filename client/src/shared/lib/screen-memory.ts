import { Platform } from 'react-native';

export const LAST_ROUTE_KEY = 'pagepay_last_route';
const isWeb = Platform.OS === 'web';

export async function saveLastRoute(route: string): Promise<void> {
  if (!route || route === '/') return;
  if (isWeb) {
    localStorage.setItem(LAST_ROUTE_KEY, route);
  } else {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(LAST_ROUTE_KEY, route);
  }
}

export async function getLastRoute(): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(LAST_ROUTE_KEY);
  }
  const SecureStore = await import('expo-secure-store');
  return await SecureStore.getItemAsync(LAST_ROUTE_KEY);
}

export async function clearLastRoute(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(LAST_ROUTE_KEY);
  } else {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(LAST_ROUTE_KEY);
  }
}
